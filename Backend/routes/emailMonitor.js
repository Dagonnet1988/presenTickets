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
import emailMonitorService from '../services/emailMonitorService.js';

const router = express.Router();

// Normaliza un bloque de texto (líneas o comas) a una lista de correos única en minúsculas
function parseEmailList(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

// Middleware para verificar autenticación
const authMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
};

// Middleware para verificar rol admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
};

/**
 * GET /api/email-monitor/status
 * Obtener estado del monitor de correo
 * Acceso: técnicos y admins
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'tech') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const status = await emailMonitorService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error obteniendo estado del monitor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/email-monitor/start
 * Iniciar el monitor de correo
 * Acceso: solo admin
 */
router.post('/start', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await emailMonitorService.start();
    res.json(result);
  } catch (error) {
    console.error('Error iniciando monitor:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

/**
 * POST /api/email-monitor/stop
 * Detener el monitor de correo
 * Acceso: solo admin
 */
router.post('/stop', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await emailMonitorService.stop();
    res.json(result);
  } catch (error) {
    console.error('Error deteniendo monitor:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

/**
 * POST /api/email-monitor/check
 * Forzar revisión inmediata de correos
 * Acceso: solo admin
 */
router.post('/check', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await emailMonitorService.forceCheck();
    res.json(result);
  } catch (error) {
    console.error('Error en revisión forzada:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

/**
 * PUT /api/email-monitor/config
 * Actualizar configuración del monitor
 * Acceso: solo admin
 */
router.put('/config', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { checkInterval, filterSender } = req.body;

    const updatedConfig = {};
    if (checkInterval) updatedConfig.checkInterval = checkInterval;
    if (filterSender) updatedConfig.filterSender = filterSender;

    const status = emailMonitorService.updateConfig(updatedConfig);
    res.json({
      success: true,
      message: 'Configuración actualizada',
      status
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/email-monitor/settings
 * Configuración gestionable del monitor (tabla email_monitor_settings)
 * Acceso: solo admin
 */
router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT enabled, filter_senders, tech_recipients, check_interval_seconds, notify_participants, updated_at
       FROM email_monitor_settings WHERE id = 1`
    );

    const row = result.rows[0] || {
      enabled: true,
      filter_senders: '',
      tech_recipients: '',
      check_interval_seconds: 120,
      notify_participants: true,
      updated_at: null
    };

    res.json({
      enabled: row.enabled !== false,
      filterSenders: parseEmailList(row.filter_senders),
      techRecipients: parseEmailList(row.tech_recipients),
      checkIntervalSeconds: row.check_interval_seconds || 120,
      notifyParticipants: row.notify_participants !== false,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Error obteniendo configuración del monitor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/email-monitor/settings
 * Guardar la configuración gestionable y aplicarla en caliente
 * Acceso: solo admin
 */
router.put('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { enabled, filterSenders, techRecipients, checkIntervalSeconds, notifyParticipants } = req.body;

    const senders = parseEmailList(Array.isArray(filterSenders) ? filterSenders.join(',') : filterSenders);
    const recipients = parseEmailList(Array.isArray(techRecipients) ? techRecipients.join(',') : techRecipients);
    const interval = Math.min(3600, Math.max(30, parseInt(checkIntervalSeconds, 10) || 120));

    if (senders.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos un remitente permitido' });
    }
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos un buzón técnico' });
    }

    await pool.query(
      `INSERT INTO email_monitor_settings
         (id, enabled, filter_senders, tech_recipients, check_interval_seconds, notify_participants, updated_by, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         filter_senders = EXCLUDED.filter_senders,
         tech_recipients = EXCLUDED.tech_recipients,
         check_interval_seconds = EXCLUDED.check_interval_seconds,
         notify_participants = EXCLUDED.notify_participants,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [
        enabled !== false,
        senders.join(','),
        recipients.join(','),
        interval,
        notifyParticipants !== false,
        req.user.id
      ]
    );

    const status = await emailMonitorService.applySettings();
    res.json({ success: true, message: 'Configuración guardada y aplicada', status });
  } catch (error) {
    console.error('Error guardando configuración del monitor:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/email-monitor/history
 * Últimos correos procesados
 * Acceso: admin y técnicos
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'tech') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const result = await pool.query(
      `SELECT pe.id, pe.external_ticket_id, pe.subject, pe.from_address, pe.processed_at,
              t.id AS ticket_id
       FROM processed_emails pe
       LEFT JOIN tickets t ON t.external_ticket_id = pe.external_ticket_id
       ORDER BY pe.processed_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial de correos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
