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
import whatsappService from '../services/whatsappService.js';

const router = express.Router();

// Middleware para verificar rol de admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
};

/**
 * Obtener estado de conexión de WhatsApp
 */
router.get('/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('❌ Error obteniendo estado WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Inicializar conexión WhatsApp
 */
router.post('/connect', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Configurar callback para QR code
    let qrCodeData = null;
    whatsappService.onQRCode((qr) => {
      qrCodeData = qr;
    });

    // Configurar callback para conexión
    whatsappService.onConnection((connected) => {
      if (connected) {
        console.log('✅ WhatsApp conectado exitosamente');
      }
    });

    // Inicializar conexión
    await whatsappService.initialize();

    res.json({ 
      success: true, 
      message: 'Iniciando conexión WhatsApp',
      qrCode: qrCodeData 
    });
  } catch (error) {
    console.error('❌ Error iniciando WhatsApp:', error);
    res.status(500).json({ error: 'Error al iniciar WhatsApp' });
  }
});

/**
 * Desconectar WhatsApp
 */
router.post('/disconnect', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'WhatsApp desconectado exitosamente' });
  } catch (error) {
    console.error('❌ Error desconectando WhatsApp:', error);
    res.status(500).json({ error: 'Error al desconectar WhatsApp' });
  }
});

/**
 * Reconectar WhatsApp desde cero
 */
router.post('/reconnect', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await whatsappService.reconnect();
    res.json({ success: true, message: 'Reconexión WhatsApp iniciada exitosamente' });
  } catch (error) {
    console.error('❌ Error reconectando WhatsApp:', error);
    res.status(500).json({ error: 'Error al reconectar WhatsApp' });
  }
});

/**
 * Enviar mensaje de prueba
 */
router.post('/test-message', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Número de teléfono y mensaje son requeridos' });
    }

    const result = await whatsappService.sendMessage(phoneNumber, message);
    res.json({ success: true, message: 'Mensaje enviado exitosamente', result });
  } catch (error) {
    console.error('❌ Error enviando mensaje de prueba:', error);
    res.status(500).json({ error: error.message || 'Error al enviar mensaje' });
  }
});

/**
 * Obtener configuración de notificaciones WhatsApp por usuario
 */
router.get('/user-settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        u.phone,
        COALESCE(ups.whatsapp_enabled, true) as whatsapp_enabled,
        COALESCE(ups.whatsapp_ticket_created, true) as whatsapp_ticket_created,
        COALESCE(ups.whatsapp_ticket_assigned, true) as whatsapp_ticket_assigned,
        COALESCE(ups.whatsapp_ticket_status, true) as whatsapp_ticket_status,
        COALESCE(ups.whatsapp_comments, true) as whatsapp_comments
      FROM users u
      LEFT JOIN user_preferences_settings ups ON u.id = ups.user_id
      WHERE u.id = $1
    `, [userId]);

    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error obteniendo configuración WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Actualizar configuración de notificaciones WhatsApp
 */
router.put('/user-settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      whatsapp_enabled, 
      whatsapp_ticket_created, 
      whatsapp_ticket_assigned, 
      whatsapp_ticket_status, 
      whatsapp_comments,
      // Nuevas configuraciones avanzadas
      notification_schedule,
      notification_start_time,
      notification_end_time,
      notification_mode,
      min_priority,
      weekend_notifications,
      sound_enabled,
      daily_limit,
      do_not_disturb,
      do_not_disturb_until
    } = req.body;

    const client = await pool.connect();
    
    // Insertar o actualizar configuración
    await client.query(`
      INSERT INTO user_preferences_settings (
        user_id, 
        whatsapp_enabled, 
        whatsapp_ticket_created, 
        whatsapp_ticket_assigned, 
        whatsapp_ticket_status, 
        whatsapp_comments,
        notification_schedule,
        notification_start_time,
        notification_end_time,
        notification_mode,
        min_priority,
        weekend_notifications,
        sound_enabled,
        daily_limit,
        do_not_disturb,
        do_not_disturb_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id) DO UPDATE SET
        whatsapp_enabled = EXCLUDED.whatsapp_enabled,
        whatsapp_ticket_created = EXCLUDED.whatsapp_ticket_created,
        whatsapp_ticket_assigned = EXCLUDED.whatsapp_ticket_assigned,
        whatsapp_ticket_status = EXCLUDED.whatsapp_ticket_status,
        whatsapp_comments = EXCLUDED.whatsapp_comments,
        notification_schedule = EXCLUDED.notification_schedule,
        notification_start_time = EXCLUDED.notification_start_time,
        notification_end_time = EXCLUDED.notification_end_time,
        notification_mode = EXCLUDED.notification_mode,
        min_priority = EXCLUDED.min_priority,
        weekend_notifications = EXCLUDED.weekend_notifications,
        sound_enabled = EXCLUDED.sound_enabled,
        daily_limit = EXCLUDED.daily_limit,
        do_not_disturb = EXCLUDED.do_not_disturb,
        do_not_disturb_until = EXCLUDED.do_not_disturb_until,
        updated_at = CURRENT_TIMESTAMP
    `, [
      userId, whatsapp_enabled, whatsapp_ticket_created, whatsapp_ticket_assigned, 
      whatsapp_ticket_status, whatsapp_comments, notification_schedule, 
      notification_start_time, notification_end_time, notification_mode, 
      min_priority, weekend_notifications, sound_enabled, daily_limit, 
      do_not_disturb, do_not_disturb_until
    ]);

    client.release();
    
    res.json({ success: true, message: 'Configuración actualizada exitosamente' });
  } catch (error) {
    console.error('❌ Error actualizando configuración WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estadísticas de notificaciones WhatsApp
 */
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await whatsappService.getNotificationStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener historial de notificaciones WhatsApp
 */
router.get('/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        wn.*,
        u.firstname || ' ' || u.lastname as user_name,
        u.email,
        u.phone,
        t.title as ticket_subject
      FROM whatsapp_notifications wn
      JOIN users u ON wn.user_id = u.id
      LEFT JOIN tickets t ON wn.ticket_id = t.id
      ORDER BY wn.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo historial WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Función para enviar notificación WhatsApp (uso interno)
 */
export async function sendWhatsAppNotification(userId, ticketId, message, notificationType) {
  try {
    // Verificar si el usuario tiene WhatsApp habilitado
    const client = await pool.connect();
    const settingsResult = await client.query(`
      SELECT 
        u.phone,
        COALESCE(ups.whatsapp_enabled, true) as whatsapp_enabled,
        COALESCE(ups.whatsapp_ticket_created, true) as whatsapp_ticket_created,
        COALESCE(ups.whatsapp_ticket_assigned, true) as whatsapp_ticket_assigned,
        COALESCE(ups.whatsapp_ticket_status, true) as whatsapp_ticket_status,
        COALESCE(ups.whatsapp_comments, true) as whatsapp_comments
      FROM users u
      LEFT JOIN user_preferences_settings ups ON u.id = ups.user_id
      WHERE u.id = $1
    `, [userId]);

    client.release();

    if (settingsResult.rows.length === 0) {
      console.log(`⚠️ Usuario ${userId} no encontrado`);
      return false;
    }

    const settings = settingsResult.rows[0];

    // Verificar si WhatsApp está habilitado
    if (!settings.whatsapp_enabled) {
      console.log(`⚠️ Usuario ${userId} no tiene WhatsApp habilitado`);
      return false;
    }

    // Verificar si el tipo de notificación está habilitado
    const typeMapping = {
      'nuevo_ticket': 'whatsapp_ticket_created',
      'ticket_asignado': 'whatsapp_ticket_assigned',
      'cambio_estado': 'whatsapp_ticket_status',
      'ticket_reabierto': 'whatsapp_ticket_status',
      'comentario': 'whatsapp_comments',
      'admin_comentario': 'whatsapp_comments'
    };

    if (typeMapping[notificationType] && !settings[typeMapping[notificationType]]) {
      console.log(`⚠️ Usuario ${userId} no tiene habilitado el tipo de notificación ${notificationType}`);
      return false;
    }

    // Enviar notificación
    return await whatsappService.sendTicketNotification(userId, ticketId, message, notificationType);
  } catch (error) {
    console.error('❌ Error enviando notificación WhatsApp:', error);
    return false;
  }
}

/**
 * Obtener plantillas de mensajes WhatsApp
 */
router.get('/templates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Obtener las plantillas del usuario administrador
    const result = await client.query(`
      SELECT 
        whatsapp_template_new_ticket,
        whatsapp_template_ticket_assigned,
        whatsapp_template_status_change,
        whatsapp_template_comment
      FROM user_preferences_settings ups
      INNER JOIN users u ON ups.user_id = u.id
      WHERE u.role = 'admin'
      LIMIT 1
    `);

    client.release();

    // Si no hay plantillas o el admin no tiene configuración, devolver plantillas por defecto
    if (result.rows.length === 0 || !result.rows[0].whatsapp_template_new_ticket) {
      const defaultTemplates = {
        new_ticket: '🆕 *PresenTickets* - Nuevo Ticket\n\nHola {userName},\n\nSe ha creado un nuevo ticket #{ticketId}\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
        ticket_assigned: '👤 *PresenTickets* - Ticket Asignado\n\nHola {userName},\n\nSe le ha asignado el ticket #{ticketId}\n📝 Asunto: {subject}\n\nPor favor revise y atienda este ticket.\n\n🕒 {timestamp}',
        status_change: '🔄 *PresenTickets* - Cambio de Estado\n\nHola {userName},\n\nEl ticket #{ticketId} cambió a: *{newStatus}*\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
        comment: '💬 *PresenTickets* - Nuevo Comentario\n\nHola {userName},\n\nNuevo comentario en el ticket #{ticketId}\n📝 Asunto: {subject}\n\n💭 Comentario: {comment}\n\n🕒 {timestamp}'
      };
      return res.json(defaultTemplates);
    }

    // Convertir a formato esperado por el frontend
    const templates = {
      new_ticket: result.rows[0].whatsapp_template_new_ticket || '',
      ticket_assigned: result.rows[0].whatsapp_template_ticket_assigned || '',
      status_change: result.rows[0].whatsapp_template_status_change || '',
      comment: result.rows[0].whatsapp_template_comment || ''
    };

    res.json(templates);
  } catch (error) {
    console.error('❌ Error obteniendo plantillas WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Guardar plantillas de mensajes WhatsApp
 */
router.post('/templates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { templates } = req.body;

    if (!templates || typeof templates !== 'object') {
      return res.status(400).json({ error: 'Plantillas requeridas' });
    }

    const client = await pool.connect();
    
    // Buscar el usuario administrador
    const adminResult = await client.query(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);

    if (adminResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Usuario administrador no encontrado' });
    }

    const adminUserId = adminResult.rows[0].id;

    // Verificar si existe configuración de preferencias para el admin
    const preferencesResult = await client.query(`
      SELECT id FROM user_preferences_settings WHERE user_id = $1
    `, [adminUserId]);

    if (preferencesResult.rows.length === 0) {
      // Crear configuración de preferencias para el admin si no existe
      await client.query(`
        INSERT INTO user_preferences_settings (user_id) VALUES ($1)
      `, [adminUserId]);
    }

    // Actualizar las plantillas
    await client.query(`
      UPDATE user_preferences_settings 
      SET 
        whatsapp_template_new_ticket = $1,
        whatsapp_template_ticket_assigned = $2,
        whatsapp_template_status_change = $3,
        whatsapp_template_comment = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
    `, [
      templates.new_ticket || null,
      templates.ticket_assigned || null,
      templates.status_change || null,
      templates.comment || null,
      adminUserId
    ]);

    client.release();
    
    res.json({ success: true, message: 'Plantillas guardadas exitosamente' });
  } catch (error) {
    console.error('❌ Error guardando plantillas WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
