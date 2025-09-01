/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import express from 'express';
import MaintenanceSimpleService from '../services/maintenanceSimpleService.js';

const router = express.Router();

// Middleware para verificar que solo admins puedan gestionar mantenimiento
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar mantenimiento' });
  }
  next();
};

// Obtener estado actual del mantenimiento (ahora público en server.js)
// router.get('/status', async (req, res) => {
//   try {
//     const status = await MaintenanceSimpleService.getStatus();
//     res.json(status);
//   } catch (error) {
//     console.error('Error obteniendo estado de mantenimiento:', error);
//     res.status(500).json({ error: 'Error interno del servidor' });
//   }
// });

// Iniciar mantenimiento (solo admins)
router.post('/start', requireAdmin, async (req, res) => {
  try {
    const { message, countdownSeconds } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }
    
    if (!countdownSeconds || countdownSeconds < 5) {
      return res.status(400).json({ error: 'El tiempo de cuenta atrás debe ser al menos 5 segundos' });
    }
    
    const status = await MaintenanceSimpleService.startMaintenanceCountdown(
      message, 
      countdownSeconds, 
      req.user.id
    );

    // Emitir evento de cuenta atrás a todos los usuarios conectados
    if (req.app.get('io')) {
      req.app.get('io').emit('maintenance-countdown', {
        message,
        countdownSeconds,
        timestamp: new Date()
      });

      // Activar mantenimiento efectivo después del countdown
      setTimeout(async () => {
        try {
          await MaintenanceSimpleService.activateMaintenance();
          req.app.get('io').emit('maintenance-start', {
            timestamp: new Date()
          });
        } catch (error) {
          console.error('❌ Error activando mantenimiento después de countdown:', error);
        }
      }, countdownSeconds * 1000);
    } else {
      console.error('❌ Socket.IO no está disponible en req.app');
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error iniciando mantenimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Terminar mantenimiento (solo admins)
router.post('/stop', requireAdmin, async (req, res) => {
  try {
    const status = await MaintenanceSimpleService.stopMaintenance();
    
    // Emitir evento a todos los usuarios
    if (req.app.get('io')) {
      req.app.get('io').emit('maintenance-ended', {
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error terminando mantenimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
