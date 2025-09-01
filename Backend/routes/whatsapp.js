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
 * Obtener configuración global del sistema WhatsApp
 */
router.get('/global-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Buscar configuración global del sistema
    const result = await client.query(`
      SELECT 
        whatsapp_global_enabled,
        whatsapp_global_ticket_created,
        whatsapp_global_ticket_assigned,
        whatsapp_global_ticket_status,
        whatsapp_global_comments
      FROM system_settings 
      WHERE id = 1
    `);

    client.release();
    
    // Si no existe configuración, devolver valores por defecto
    if (result.rows.length === 0) {
      const defaultSettings = {
        whatsapp_global_enabled: true,
        whatsapp_global_ticket_created: true,
        whatsapp_global_ticket_assigned: true,
        whatsapp_global_ticket_status: true,
        whatsapp_global_comments: true
      };
      return res.json(defaultSettings);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error obteniendo configuración global WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Actualizar configuración global del sistema WhatsApp
 */
router.post('/global-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      whatsapp_global_enabled,
      whatsapp_global_ticket_created,
      whatsapp_global_ticket_assigned,
      whatsapp_global_ticket_status,
      whatsapp_global_comments
    } = req.body;

    const client = await pool.connect();
    
    // Verificar si existe la tabla system_settings y el registro
    const checkResult = await client.query(`
      SELECT id FROM system_settings WHERE id = 1
    `);

    if (checkResult.rows.length === 0) {
      // Crear registro si no existe
      await client.query(`
        INSERT INTO system_settings (
          id,
          whatsapp_global_enabled,
          whatsapp_global_ticket_created,
          whatsapp_global_ticket_assigned,
          whatsapp_global_ticket_status,
          whatsapp_global_comments
        ) VALUES (1, $1, $2, $3, $4, $5)
      `, [
        whatsapp_global_enabled ?? true,
        whatsapp_global_ticket_created ?? true,
        whatsapp_global_ticket_assigned ?? true,
        whatsapp_global_ticket_status ?? true,
        whatsapp_global_comments ?? true
      ]);
    } else {
      // Actualizar registro existente
      await client.query(`
        UPDATE system_settings SET
          whatsapp_global_enabled = $1,
          whatsapp_global_ticket_created = $2,
          whatsapp_global_ticket_assigned = $3,
          whatsapp_global_ticket_status = $4,
          whatsapp_global_comments = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [
        whatsapp_global_enabled ?? true,
        whatsapp_global_ticket_created ?? true,
        whatsapp_global_ticket_assigned ?? true,
        whatsapp_global_ticket_status ?? true,
        whatsapp_global_comments ?? true
      ]);
    }

    client.release();
    
    res.json({ success: true, message: 'Configuración global actualizada exitosamente' });
  } catch (error) {
    console.error('❌ Error actualizando configuración global WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    const { period = '7' } = req.query; // Respetar filtro del frontend
    const stats = await whatsappService.getNotificationStats(period);
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
    const { limit = 50, offset = 0, page = 0, status, user, type, search } = req.query;
    const client = await pool.connect();
    
    // Calcular offset basado en page si se proporciona page en lugar de offset
    const actualOffset = page ? parseInt(page) * parseInt(limit) : parseInt(offset);
    
    // Construir condiciones WHERE dinámicamente
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    // Filtro por estado
    if (status && status !== 'all') {
      whereConditions.push(`wn.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    // Filtro por usuario (búsqueda en nombre)
    if (user && user.trim() !== '') {
      whereConditions.push(`(u.firstname ILIKE $${paramIndex} OR u.lastname ILIKE $${paramIndex} OR (u.firstname || ' ' || u.lastname) ILIKE $${paramIndex})`);
      queryParams.push(`%${user.trim()}%`);
      paramIndex++;
    }
    
    // Filtro por tipo de mensaje
    if (type && type !== 'all') {
      const normalizedType = type.toLowerCase().trim();
      if (normalizedType === 'comentario') {
        whereConditions.push(`wn.notification_type IN ('comentario_user', 'comentario_tech', 'comentario_admin', 'admin_comentario', 'comment')`);
      } else if (normalizedType === 'nuevo_ticket') {
        whereConditions.push(`wn.notification_type IN ('new_ticket', 'nuevo_ticket')`);
      } else if (normalizedType === 'ticket_asignado') {
        whereConditions.push(`wn.notification_type IN ('ticket_assigned', 'ticket_asignado')`);
      } else if (normalizedType === 'cambio_estado') {
        whereConditions.push(`wn.notification_type IN ('status_change', 'cambio_estado', 'ticket_reabierto')`);
      } else {
        whereConditions.push(`wn.notification_type ILIKE $${paramIndex}`);
        queryParams.push(`%${type}%`);
        paramIndex++;
      }
    }
    
    // Búsqueda general (en mensaje, asunto del ticket, teléfono)
    if (search && search.trim() !== '') {
      whereConditions.push(`(
        wn.message ILIKE $${paramIndex} OR 
        wn.phone_number ILIKE $${paramIndex} OR 
        t.title ILIKE $${paramIndex} OR
        wn.error_message ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Query base con filtros aplicados
    const baseQuery = `
      SELECT 
        wn.id,
        wn.user_id,
        wn.ticket_id,
        wn.message,
        wn.phone_number,
        wn.status,
        wn.error_message,
        wn.created_at,
        wn.notification_type,
        u.firstname || ' ' || u.lastname as user_name,
        u.email,
        u.phone,
        t.title as ticket_subject,
        CASE 
          WHEN wn.notification_type IN ('comentario_user', 'comentario_tech', 'comentario_admin', 'admin_comentario', 'comment') THEN 'comentario'
          WHEN wn.notification_type IN ('new_ticket', 'nuevo_ticket') THEN 'nuevo_ticket'
          WHEN wn.notification_type IN ('ticket_assigned', 'ticket_asignado') THEN 'ticket_asignado'
          WHEN wn.notification_type IN ('status_change', 'cambio_estado', 'ticket_reabierto') THEN 'cambio_estado'
          ELSE COALESCE(wn.notification_type, 'unknown')
        END as message_type
      FROM whatsapp_notifications wn
      JOIN users u ON wn.user_id = u.id
      LEFT JOIN tickets t ON wn.ticket_id = t.id
      ${whereClause}
    `;
    
    // Obtener count total con filtros
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) filtered_messages`;
    const countResult = await client.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Obtener datos paginados con filtros
    const dataQuery = `${baseQuery} ORDER BY wn.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, actualOffset);
    const result = await client.query(dataQuery, queryParams);

    client.release();
    
    // Devolver datos con metadata de paginación
    res.json({
      data: result.rows,
      total: totalCount,
      page: Math.floor(actualOffset / limit) + 1,
      limit: parseInt(limit),
      filters: {
        status: status || 'all',
        user: user || '',
        type: type || 'all',
        search: search || ''
      }
    });
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
    const client = await pool.connect();
    
    // 1. VERIFICAR CONFIGURACIÓN GLOBAL DEL SISTEMA PRIMERO
    const globalSettingsResult = await client.query(`
      SELECT 
        whatsapp_global_enabled,
        whatsapp_global_ticket_created,
        whatsapp_global_ticket_assigned,
        whatsapp_global_ticket_status,
        whatsapp_global_comments
      FROM system_settings 
      WHERE id = 1
    `);

    // Si existe configuración global, verificarla
    if (globalSettingsResult.rows.length > 0) {
      const globalSettings = globalSettingsResult.rows[0];
      
      // Verificar si WhatsApp está globalmente deshabilitado
      if (!globalSettings.whatsapp_global_enabled) {
        console.log(`⚠️ WhatsApp está globalmente deshabilitado`);
        client.release();
        return false;
      }

      // Verificar si el tipo específico está globalmente deshabilitado
      const globalTypeMapping = {
        'nuevo_ticket': 'whatsapp_global_ticket_created',
        'ticket_asignado': 'whatsapp_global_ticket_assigned',
        'cambio_estado': 'whatsapp_global_ticket_status',
        'ticket_reabierto': 'whatsapp_global_ticket_status',
        'comentario': 'whatsapp_global_comments',
        'comentario_user': 'whatsapp_global_comments',
        'admin_comentario': 'whatsapp_global_comments'
      };

      if (globalTypeMapping[notificationType] && !globalSettings[globalTypeMapping[notificationType]]) {
        console.log(`⚠️ Tipo de notificación ${notificationType} está globalmente deshabilitado`);
        client.release();
        return false;
      }
    }

    // 2. VERIFICAR CONFIGURACIÓN DEL USUARIO
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

    // Verificar si WhatsApp está habilitado para el usuario
    if (!settings.whatsapp_enabled) {
      console.log(`⚠️ Usuario ${userId} no tiene WhatsApp habilitado`);
      return false;
    }

    // Verificar si el tipo de notificación está habilitado para el usuario
    const typeMapping = {
      'nuevo_ticket': 'whatsapp_ticket_created',
      'ticket_asignado': 'whatsapp_ticket_assigned',
      'cambio_estado': 'whatsapp_ticket_status',
      'ticket_reabierto': 'whatsapp_ticket_status',
      'comentario': 'whatsapp_comments',
      'comentario_user': 'whatsapp_comments',
      'admin_comentario': 'whatsapp_comments'
    };

    if (typeMapping[notificationType] && !settings[typeMapping[notificationType]]) {
      console.log(`⚠️ Usuario ${userId} no tiene habilitado el tipo de notificación ${notificationType}`);
      return false;
    }

    // 3. ENVIAR NOTIFICACIÓN SI TODAS LAS VERIFICACIONES PASAN
    return await whatsappService.sendTicketNotification(userId, ticketId, message, notificationType);
  } catch (error) {
    console.error('❌ Error enviando notificación WhatsApp:', error);
    return false;
  }
}

/**
 * Obtener plantillas de mensajes WhatsApp
 */
router.get('/global-config', authMiddleware, adminMiddleware, async (req, res) => {
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

    // Obtener configuración global de WhatsApp
    if (result.rows.length === 0 || !result.rows[0].whatsapp_template_new_ticket) {
      const defaultTemplates = {
        new_ticket: '🆕 *PresenTickets - Clínica La Presentación*\n\n¡Hola {userName}!\n\n📋 Se ha creado un nuevo ticket en el sistema:\n\n🎫 *Ticket #{ticketId}*\n📝 *Asunto:* {subject}\n🕒 *Fecha:* {timestamp}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n💡 Para más detalles, ingresa al sistema PresenTickets.\n\n_Este es un mensaje automático, no responder._',
        
        ticket_assigned: '👤 *PresenTickets - Clínica La Presentación*\n\n¡Hola {userName}!\n\n🔔 Se le ha asignado un nuevo ticket:\n\n🎫 *Ticket #{ticketId}*\n📝 *Asunto:* {subject}\n🕒 *Fecha:* {timestamp}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚡ Por favor revise y atienda este ticket a la brevedad.\n\n� Para más detalles, ingresa al sistema PresenTickets.\n\n_Este es un mensaje automático, no responder._',
        
        status_change: '🔄 *PresenTickets - Clínica La Presentación*\n\n¡Hola {userName}!\n\n📈 El estado de su ticket ha cambiado:\n\n🎫 *Ticket #{ticketId}*\n📝 *Asunto:* {subject}\n🔄 *Nuevo Estado:* {newStatus}\n🕒 *Fecha:* {timestamp}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n💡 Para más detalles, ingresa al sistema PresenTickets.\n\n_Este es un mensaje automático, no responder._',
        
        comment: '💬 *PresenTickets - Clínica La Presentación*\n\n¡Hola {userName}!\n\n📝 Nuevo comentario en su ticket:\n\n🎫 *Ticket #{ticketId}*\n📝 *Asunto:* {subject}\n💭 *Comentario:* {comment}\n🕒 *Fecha:* {timestamp}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n💡 Para más detalles, ingresa al sistema PresenTickets.\n\n_Este es un mensaje automático, no responder._'
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

/**
 * Obtener configuración global de WhatsApp
 */
router.get('/global-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        whatsapp_global_enabled,
        whatsapp_global_ticket_created,
        whatsapp_global_ticket_assigned,
        whatsapp_global_ticket_status,
        whatsapp_global_comments
      FROM system_settings 
      WHERE id = 1
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      // Si no existe configuración, crear una por defecto
      await pool.query(`
        INSERT INTO system_settings (
          id,
          whatsapp_global_enabled,
          whatsapp_global_ticket_created,
          whatsapp_global_ticket_assigned,
          whatsapp_global_ticket_status,
          whatsapp_global_comments
        ) VALUES (1, true, true, true, true, true)
      `);
      
      res.json({
        whatsapp_global_enabled: true,
        whatsapp_global_ticket_created: true,
        whatsapp_global_ticket_assigned: true,
        whatsapp_global_ticket_status: true,
        whatsapp_global_comments: true
      });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('❌ Error obteniendo configuración global WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Actualizar configuración global de WhatsApp
 */
router.put('/global-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      whatsapp_global_enabled, 
      whatsapp_global_ticket_created,
      whatsapp_global_ticket_assigned,
      whatsapp_global_ticket_status,
      whatsapp_global_comments
    } = req.body;

    // Actualizar la configuración (siempre existe con id = 1)
    await pool.query(`
      UPDATE system_settings 
      SET 
        whatsapp_global_enabled = $1,
        whatsapp_global_ticket_created = $2,
        whatsapp_global_ticket_assigned = $3,
        whatsapp_global_ticket_status = $4,
        whatsapp_global_comments = $5,
        updated_by = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      whatsapp_global_enabled, 
      whatsapp_global_ticket_created,
      whatsapp_global_ticket_assigned,
      whatsapp_global_ticket_status,
      whatsapp_global_comments,
      req.user.id
    ]);

    res.json({ success: true, message: 'Configuración global guardada exitosamente' });
  } catch (error) {
    console.error('❌ Error guardando configuración global WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estadísticas detalladas de notificaciones WhatsApp
 */
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    
    // Validar período
    const validPeriods = ['7', '15', '30', '60', '90'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Período inválido. Usar: 7, 15, 30, 60, 90 días' });
    }
    
    const stats = await whatsappService.getDetailedStats(period);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estadísticas simples de notificaciones WhatsApp (compatibilidad)
 */
router.get('/stats/simple', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await whatsappService.getNotificationStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas simples WhatsApp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Generar reporte de rendimiento de WhatsApp
 */
router.get('/performance-report', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = '30', format = 'json' } = req.query;
    
    // Validar período
    const validPeriods = ['7', '15', '30', '60', '90'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Período inválido. Usar: 7, 15, 30, 60, 90 días' });
    }
    
    const report = await whatsappService.generatePerformanceReport(period);
    
    if (format === 'text') {
      // Retornar reporte en formato texto para visualización
      let textReport = `${report.title}\n`;
      textReport += `Generado: ${new Date(report.generated_at).toLocaleString()}\n\n`;
      
      textReport += `=== RESUMEN EJECUTIVO ===\n`;
      textReport += `Total de notificaciones: ${report.executive_summary.total_notifications}\n`;
      textReport += `Tasa de éxito: ${report.executive_summary.success_rate}\n`;
      textReport += `Tasa de fallos: ${report.executive_summary.failure_rate}\n`;
      textReport += `Usuarios únicos alcanzados: ${report.executive_summary.unique_users_reached}\n`;
      textReport += `Tickets con notificaciones: ${report.executive_summary.tickets_with_notifications}\n\n`;
      
      textReport += `=== ANÁLISIS DE RENDIMIENTO ===\n`;
      textReport += `Estado: ${report.performance_analysis.status}\n`;
      textReport += `Horarios pico: ${report.performance_analysis.peak_hours.join(', ')}\n\n`;
      
      textReport += `=== RECOMENDACIONES ===\n`;
      report.performance_analysis.recommendations.forEach(rec => {
        textReport += `${rec}\n`;
      });
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(textReport);
    } else {
      res.json(report);
    }
  } catch (error) {
    console.error('❌ Error generando reporte de rendimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estadísticas anti-bloqueo y rate limiting
 */
router.get('/anti-block-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = whatsappService.getAntiBlockStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas anti-bloqueo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estadísticas horarias de los últimos días
 */
router.get('/hourly-usage', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = '7' } = req.query;
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        DATE(created_at) as date,
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as message_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM whatsapp_notifications 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at)
      ORDER BY date DESC, hour DESC
    `);
    
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas horarias:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Configurar límites de rate limiting (solo admin) - PERSISTENTE EN BD
 */
router.post('/configure-limits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      maxDailyMessages, 
      maxMessagesPerHour, 
      minDelayBetweenMessages, 
      maxDelayBetweenMessages,
      maxBurstMessages 
    } = req.body;
    
    // Validar límites
    if (maxDailyMessages && (maxDailyMessages < 1 || maxDailyMessages > 1000)) {
      return res.status(400).json({ error: 'Límite diario debe estar entre 1 y 1000' });
    }
    
    if (maxMessagesPerHour && (maxMessagesPerHour < 1 || maxMessagesPerHour > 100)) {
      return res.status(400).json({ error: 'Límite por hora debe estar entre 1 y 100' });
    }
    
    if (minDelayBetweenMessages && minDelayBetweenMessages < 500) {
      return res.status(400).json({ error: 'Delay mínimo debe ser al menos 500ms' });
    }
    
    if (maxDelayBetweenMessages && maxDelayBetweenMessages > 30000) {
      return res.status(400).json({ error: 'Delay máximo no puede exceder 30 segundos' });
    }
    
    // Actualizar configuración en memoria
    const rateLimits = whatsappService.rateLimits;
    if (maxDailyMessages !== undefined) rateLimits.maxDailyMessages = maxDailyMessages;
    if (maxMessagesPerHour !== undefined) rateLimits.maxMessagesPerHour = maxMessagesPerHour;
    if (minDelayBetweenMessages !== undefined) rateLimits.minDelayBetweenMessages = minDelayBetweenMessages;
    if (maxDelayBetweenMessages !== undefined) rateLimits.maxDelayBetweenMessages = maxDelayBetweenMessages;
    if (maxBurstMessages !== undefined) rateLimits.maxBurstMessages = maxBurstMessages;
    
    // Persistir en base de datos
    const saved = await whatsappService.saveAntiBlockConfigToDB();
    
    if (saved) {
      res.json({ 
        message: 'Límites actualizados y guardados exitosamente en base de datos',
        newLimits: rateLimits,
        persistent: true
      });
    } else {
      res.json({ 
        message: 'Límites actualizados en memoria pero error al guardar en BD',
        newLimits: rateLimits,
        persistent: false,
        warning: 'Los cambios se perderán al reiniciar el servidor'
      });
    }
  } catch (error) {
    console.error('❌ Error configurando límites:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener configuración actual de límites de antibloqueo
 */
router.get('/get-limits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rateLimits = whatsappService.rateLimits;
    res.json({
      message: 'Configuración actual de límites',
      limits: rateLimits,
      info: {
        minDelayBetweenMessages: 'Delay mínimo entre mensajes (ms)',
        maxDelayBetweenMessages: 'Delay máximo entre mensajes (ms)',
        maxMessagesPerHour: 'Máximo mensajes por hora',
        maxDailyMessages: 'Máximo mensajes por día',
        maxBurstMessages: 'Máximo mensajes en ráfaga'
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo límites:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener horarios laborales
 */
router.get('/business-hours', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const businessHours = await whatsappService.getBusinessHours();
    const isCurrentlyBusinessHours = await whatsappService.isBusinessHours();
    
    res.json({
      schedule: businessHours,
      isCurrentlyBusinessHours,
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo horarios laborales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
