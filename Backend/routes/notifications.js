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
import { pool } from '../db.js';
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
    // Usar COALESCE para priorizar external_ticket_id de la notificación sobre el del ticket
    const result = await pool.query(
      `SELECT n.*, 
              COALESCE(n.external_ticket_id, t.external_ticket_id) as external_ticket_id
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
// Para notificaciones de email externo: marcar TODAS las del mismo external_ticket_id (más robusto que email_message_id)
router.post('/read/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    // Primero obtener la notificación para verificar si es de tipo external_email
    const notificationResult = await pool.query(
      'SELECT type, email_message_id, external_ticket_id FROM notifications WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    
    if (notificationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    
    const notification = notificationResult.rows[0];
    
    // Si es notificación de email externo, marcar TODAS las del mismo external_ticket_id para TODOS los usuarios
    if (notification.type === 'external_email' && notification.external_ticket_id) {
      // Obtener IDs de usuarios afectados antes de marcar como leídas
      const affectedUsersResult = await pool.query(
        'SELECT DISTINCT user_id FROM notifications WHERE external_ticket_id = $1 AND type = $2 AND is_read = false',
        [notification.external_ticket_id, 'external_email']
      );
      
      const updateResult = await pool.query(
        'UPDATE notifications SET is_read = true WHERE external_ticket_id = $1 AND type = $2 RETURNING id',
        [notification.external_ticket_id, 'external_email']
      );
      
      // Emitir WebSocket a TODOS los técnicos afectados para que actualicen sus notificaciones
      const io = req.app.get('io');
      if (io && affectedUsersResult.rows.length > 0) {
        for (const row of affectedUsersResult.rows) {
          // No emitir al usuario que hizo la acción (ese ya actualizó)
          if (row.user_id !== userId) {
            io.to(`user-${row.user_id}`).emit('shared-notification-read', {
              externalTicketId: notification.external_ticket_id,
              markedBy: userId
            });
          }
        }
      }
      
      return res.json({ 
        success: true, 
        shared: true, 
        markedCount: updateResult.rowCount,
        externalTicketId: notification.external_ticket_id
      });
    } else {
      // Notificación normal: solo marcar la del usuario actual
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );
    }
    
    res.json({ success: true, shared: false });
  } catch (err) {
    console.error('Error al marcar notificación como leída:', err);
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

// Marcar todas las notificaciones del usuario como leídas
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error al marcar todas las notificaciones como leídas:', err);
    res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas' });
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
export async function createNotification({ user_id, type, message, ticket_id, whatsapp_message }) {
  await pool.query(
    'INSERT INTO notifications (user_id, type, message, ticket_id) VALUES ($1, $2, $3, $4)',
    [user_id, type, message, ticket_id]
  );

  // Enviar notificación WhatsApp de forma asíncrona (no bloqueante)
  // Usar el contenido real del comentario para WhatsApp si está disponible
  const whatsappContent = whatsapp_message || message;
  
  // Usar setImmediate para que se ejecute después del return
  setImmediate(async () => {
    try {
      await sendWhatsAppNotification(user_id, ticket_id, whatsappContent, type);
    } catch (error) {
      // Capturar CUALQUIER error para evitar crash del servicio
      console.error('❌ Error enviando notificación WhatsApp (capturado):', error?.message || error);
    }
  });
}

export default router;
