/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const router = express.Router();

// Middleware para verificar rol de administrador
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
}

// Crear un nuevo usuario (solo para administradores)
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, role, firstname, lastname } = req.body;
  let { email, phone } = req.body;

  // Validar los datos obligatorios
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'Todos los campos obligatorios (username, password, role) deben ser proporcionados' });
  }

  // Asignar null si los campos opcionales no están presentes
  email = email || null;
  phone = phone || null;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Encriptar la contraseña

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (username, password, role, firstname, lastname, email, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, role, status`,
        [username, hashedPassword, role, firstname, lastname, email, phone]
      );

      res.status(201).json({ message: 'Usuario creado exitosamente', user: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al crear el usuario:', error);
    if (error.code === '23505') {
      res.status(400).json({ message: 'El email ya está en uso' });
    } else {
      res.status(500).json({ message: 'Error al crear el usuario' });
    }
  }
});

// Obtener todos los usuarios (solo para administradores)
router.get('/', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, role, firstname, lastname, email, phone, status, created_at FROM users'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener los usuarios:', err);
    res.status(500).json({ message: 'Error al obtener los usuarios' });
  } finally {
    client.release();
  }
});

// Obtener lista de técnicos (para asignación de tickets)
router.get('/technicians', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT id, firstname, lastname FROM users WHERE role = 'tech' AND status = true"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener técnicos:', err);
    res.status(500).json({ message: 'Error al obtener la lista de técnicos' });
  } finally {
    client.release();
  }
});

// Obtener información básica de un usuario (solo nombre para mostrar en tickets)
router.get('/basic/:id', async (req, res) => {
  const { id } = req.params;

  if (isNaN(id)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, firstname, lastname FROM users WHERE id = $1',
      [parseInt(id)]
    );

    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ message: 'Usuario no encontrado' });
    }
  } catch (err) {
    console.error('Error al obtener información básica del usuario:', err);
    res.status(500).json({ message: 'Error al obtener el usuario' });
  } finally {
    client.release();
  }
});

// Obtener un usuario por ID (permitir acceso si es el mismo usuario o admin)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const requestingUserId = req.user.id;
  const requestingUserRole = req.user.role;

  if (isNaN(id)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  // Convertir ambos a números para comparación consistente
  const requestedId = parseInt(id);
  const userId = parseInt(requestingUserId);

  // Permitir acceso si es el mismo usuario o es admin
  if (requestedId !== userId && requestingUserRole !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Solo puedes ver tu propio perfil.' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, role, firstname, lastname, email, phone, created_at FROM users WHERE id = $1',
      [requestedId]
    );

    if (result.rows.length > 0) {
            res.json(result.rows[0]);
    } else {
      res.status(404).json({ message: 'Usuario no encontrado' });
    }
  } catch (err) {
    console.error('Error al obtener el usuario:', err);
    res.status(500).json({ message: 'Error al obtener el usuario' });
  } finally {
    client.release();
  }
});

// Actualizar un usuario (solo para administradores)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, role, firstname, lastname, email, phone, status } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (username) {
    updates.push(`username = $${index}`);
    values.push(username);
    index++;
  }

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    updates.push(`password = $${index}`);
    values.push(hashedPassword);
    index++;
  }

  if (role) {
    updates.push(`role = $${index}`);
    values.push(role);
    index++;
  }

  if (firstname) {
    updates.push(`firstname = $${index}`);
    values.push(firstname);
    index++;
  }

  if (lastname) {
    updates.push(`lastname = $${index}`);
    values.push(lastname);
    index++;
  }

  if (email) {
    updates.push(`email = $${index}`);
    values.push(email);
    index++;
  }

  if (phone) {
    updates.push(`phone = $${index}`);
    values.push(phone);
    index++;
  }

  if (status !== undefined) {
    updates.push(`status = $${index}`);
    values.push(status);
    index++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
  }

  const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${index}`;
  values.push(parseInt(id));

  const client = await pool.connect();
  try {
    await client.query(query, values);
    res.status(200).json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar el usuario:', err);
    res.status(500).json({ message: 'Error al actualizar el usuario' });
  } finally {
    client.release();
  }
});

// Actualizar perfil del usuario (para el propio usuario)
router.patch('/profile/:id', async (req, res) => {
  const { id } = req.params;
  const { firstname, lastname, email, phone, password } = req.body;

  // Validar que el ID sea un número entero
  if (isNaN(id)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  // Verificar que el usuario solo puede actualizar su propio perfil o que sea admin
  if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'No puedes editar el perfil de otro usuario' });
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (firstname) {
    updates.push(`firstname = $${index}`);
    values.push(firstname);
    index++;
  }

  if (lastname) {
    updates.push(`lastname = $${index}`);
    values.push(lastname);
    index++;
  }

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    updates.push(`password = $${index}`);
    values.push(hashedPassword);
    index++;
  }

  if (email) {
    updates.push(`email = $${index}`);
    values.push(email);
    index++;
  }

  // Solo permitir actualizar teléfono si el usuario no es de tipo 'user' o si es admin
  if (phone && (req.user.role !== 'user' || req.user.role === 'admin')) {
    updates.push(`phone = $${index}`);
    values.push(phone);
    index++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
  }

  const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${index}`;
  values.push(parseInt(id));

  const client = await pool.connect();
  try {
    await client.query(query, values);
    res.status(200).json({ message: 'Perfil actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar el perfil:', err);
    res.status(500).json({ message: 'Error al actualizar el perfil' });
  } finally {
    client.release();
  }
});

// Verificar si un username ya existe
router.get('/exists/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT COUNT(*) FROM users WHERE username = $1', [username]);
      const exists = parseInt(result.rows[0].count, 10) > 0;
      res.status(200).json({ exists }); // Devolver un objeto JSON con la propiedad "exists"
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al verificar el username:', error);
    res.status(500).json({ message: 'Error al verificar el username' });
  }
});

export default router;
