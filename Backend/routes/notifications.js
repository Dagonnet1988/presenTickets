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
import { sendWhatsAppNotification } from './whatsapp.js';

const router = express.Router();

// Obtener notificaciones no leídas del usuario
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Primero marcar automáticamente como leídas las notificaciones de ID externo
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND type = $2 AND is_read = false',
      [userId, 'id_externo_actualizado']
    );
    
    // Luego obtener las notificaciones no leídas (que ya no incluirán las de ID externo)
    const result = await pool.query(
      `SELECT n.*, t.external_ticket_id 
       FROM notifications n 
       LEFT JOIN tickets t ON n.ticket_id = t.id 
       WHERE n.user_id = $1 AND n.is_read = false 
       ORDER BY n.created_at DESC`,
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

// Marcar todas las notificaciones de un ticket como leídas
router.post('/read-ticket/:ticketId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ticketId = req.params.ticketId;
    // Solo el dueño puede marcar como leídas las notificaciones de sus tickets
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE ticket_id = $1 AND user_id = $2 AND is_read = false',
      [ticketId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar notificaciones del ticket como leídas' });
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

  // Enviar notificación WhatsApp de forma asíncrona (no bloqueante)
  // Usar setImmediate para que se ejecute después del return
  setImmediate(async () => {
    try {
      await sendWhatsAppNotification(user_id, ticket_id, message, type);
    } catch (error) {
      console.error('Error enviando notificación WhatsApp:', error);
    }
  });
}

export default router;
