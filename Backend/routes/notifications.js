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
import { pool } from '../server.js';
import { authMiddleware } from './auth.js';
import { sendPushNotification } from './push.js';

const router = express.Router();

// Obtener notificaciones no leídas del usuario
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener notificaciones:', err);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Marcar notificación como leída
router.post('/read/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    // Solo el dueño puede marcar como leída
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar notificación como leída' });
  }
});

// Eliminar todas las notificaciones leídas del usuario autenticado
router.delete('/read/all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query('DELETE FROM notifications WHERE user_id = $1 AND is_read = true', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar notificaciones leídas' });
  }
});

// Eliminar una notificación por ID (solo si pertenece al usuario autenticado)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o no autorizada' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar notificación' });
  }
});

// Crear notificación (uso interno, no expuesto al frontend)
export async function createNotification({ user_id, type, message, ticket_id }) {
  await pool.query(
    'INSERT INTO notifications (user_id, type, message, ticket_id) VALUES ($1, $2, $3, $4)',
    [user_id, type, message, ticket_id]
  );

  // Enviar notificación push al usuario
  try {
    const pushNotification = {
      title: 'PresenTickets',
      body: message,
      tag: `ticket-${ticket_id}-${Date.now()}`, // Tag único para cada notificación
      url: `/ticket/${ticket_id}`,
      ticketId: ticket_id
    };
    
    await sendPushNotification(user_id, pushNotification);
  } catch (error) {
    console.error('Error enviando notificación push:', error);
    // No fallar la operación principal si las notificaciones push fallan
  }
}

export default router;
