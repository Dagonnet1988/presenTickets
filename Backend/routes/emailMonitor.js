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
import emailMonitorService from '../services/emailMonitorService.js';

const router = express.Router();

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

export default router;
