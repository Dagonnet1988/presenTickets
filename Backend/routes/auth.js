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

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import MaintenanceSimpleService from "../services/maintenanceSimpleService.js";

const router = express.Router();

// Set para trackear errores de JWT y evitar logs repetitivos
const errorLog = new Set();

// Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Validar datos de entrada
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Usuario y contraseña son obligatorios" });
  }

  const client = await pool.connect();
  try {
    // Verificar si el usuario existe
    const result = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = result.rows[0];

    // Comparar contraseñas
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Bloquear el acceso a usuarios desactivados
    if (user.status === false) {
      return res.status(403).json({
        message: "Tu usuario está deshabilitado. Contacta al administrador.",
      });
    }

    // Verificar estado de mantenimiento antes de permitir login
    const isInMaintenance = await MaintenanceSimpleService.isInMaintenance();
    if (isInMaintenance && user.role !== 'admin') {
      const maintenanceStatus = await MaintenanceSimpleService.getStatus();
      return res.status(503).json({ 
        message: "Sistema en mantenimiento",
        maintenance: true,
        maintenanceMessage: maintenanceStatus.message || 'Sistema en mantenimiento. Disculpe las molestias.'
      });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: user.id, username: user.firstname, role: user.role },
      process.env.JWT_SECRET || "supersecreto",
      { expiresIn: "12h" }
    );

    // Login exitoso
    res.json({
      message: "Inicio de sesión exitoso",
      token,
      user: { id: user.id, username: user.firstname, role: user.role },
    });
  } catch (err) {
    console.error("Error en el servidor:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

// Cache corto del estado activo/inactivo de cada usuario, para no consultar la BD
// en cada request. Un usuario desactivado deja de tener acceso en <= STATUS_TTL_MS.
const userStatusCache = new Map(); // id -> { active: boolean, expires: number }
const STATUS_TTL_MS = 60 * 1000;

export function invalidateUserStatus(userId) {
  userStatusCache.delete(Number(userId));
}

async function isUserActive(userId) {
  const id = Number(userId);
  const cached = userStatusCache.get(id);
  if (cached && cached.expires > Date.now()) {
    return cached.active;
  }

  try {
    const result = await pool.query("SELECT status FROM users WHERE id = $1", [id]);
    // Si el usuario ya no existe, se considera inactivo
    const active = result.rows.length > 0 && result.rows[0].status !== false;
    userStatusCache.set(id, { active, expires: Date.now() + STATUS_TTL_MS });
    return active;
  } catch (err) {
    // Fail-open: si la BD falla, no bloquear a los usuarios por la verificación
    console.error("No se pudo verificar el estado del usuario, se permite el acceso:", err.message);
    return true;
  }
}

// Middleware para proteger rutas con JWT
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Formato de token inválido" });
  }

  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecreto");
  } catch (err) {
    // Solo loggear errores únicos para evitar spam
    if (!errorLog.has(err.message)) {
      console.error("Token verification failed:", err.message);
      errorLog.add(err.message);
      // Limpiar el cache cada 10 minutos
      setTimeout(() => errorLog.delete(err.message), 10 * 60 * 1000);
    }
    return res.status(401).json({ message: "Token inválido o expirado" });
  }

  // Revalidar que el usuario siga activo (aunque su token siga vigente)
  if (!(await isUserActive(decoded.id))) {
    return res.status(403).json({
      message: "Tu usuario está deshabilitado. Contacta al administrador.",
      code: "USER_DISABLED",
    });
  }

  req.user = decoded;
  next();
}

export default router;
