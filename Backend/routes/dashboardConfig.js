/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * API para configuración de metas y parámetros del dashboard
 */

import express from 'express';
import { pool } from '../db.js';
import { authMiddleware } from './auth.js';

const router = express.Router();

/**
 * GET /api/dashboard-config
 * Obtener toda la configuración del dashboard
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT config_key, config_value, config_type, description, category, updated_at
        FROM dashboard_config
        ORDER BY category, config_key
      `);
      
      // Organizar configuración por categorías
      const config = {};
      result.rows.forEach(row => {
        if (!config[row.category]) {
          config[row.category] = {};
        }
        
        // Convertir valores según tipo
        let value = row.config_value;
        if (row.config_type === 'number') {
          value = parseInt(value);
        } else if (row.config_type === 'array') {
          value = value.split(',');
        }
        
        config[row.category][row.config_key] = {
          value,
          type: row.config_type,
          description: row.description,
          updated_at: row.updated_at
        };
      });
      
      res.json(config);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/dashboard-config
 * Actualizar configuración del dashboard (Solo Admin)
 */
router.put('/', authMiddleware, async (req, res) => {
  try {
    // Verificar que el usuario es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden modificar la configuración.' });
    }
    
    const { config } = req.body;
    const userId = req.user.userId;
    
    if (!config) {
      return res.status(400).json({ error: 'Datos de configuración requeridos' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Actualizar cada configuración
      for (const [configKey, configValue] of Object.entries(config)) {
        let valueStr = configValue;
        
        // Convertir arrays a string
        if (Array.isArray(configValue)) {
          valueStr = configValue.join(',');
        }
        
        await client.query(`
          UPDATE dashboard_config 
          SET config_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE config_key = $3
        `, [valueStr, userId, configKey]);
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Configuración actualizada exitosamente',
        updated_count: Object.keys(config).length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/dashboard-config/targets
 * Obtener solo las metas configuradas (para cálculos)
 */
router.get('/targets', authMiddleware, async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT config_key, config_value, config_type
        FROM dashboard_config
        WHERE category IN ('targets', 'sla', 'schedule', 'workflow')
      `);
      
      const targets = {};
      result.rows.forEach(row => {
        let value = row.config_value;
        if (row.config_type === 'number') {
          value = parseInt(value);
        } else if (row.config_type === 'array') {
          value = value.split(',');
        }
        targets[row.config_key] = value;
      });
      
      res.json(targets);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error obteniendo metas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/dashboard-config/reset
 * Restablecer configuración a valores por defecto (Solo Admin)
 */
router.post('/reset', authMiddleware, async (req, res) => {
  try {
    // Verificar que el usuario es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden restablecer la configuración.' });
    }
    
    const userId = req.user.userId;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Restablecer a valores por defecto
      const defaultConfigs = [
        ['work_hours_start', '07:00'],
        ['work_hours_end', '17:30'],
        ['work_hours_friday_end', '16:30'],
        ['lunch_break_start', '12:00'],
        ['lunch_break_end', '13:30'],
        ['target_response_time', '240'],
        ['target_resolution_time', '1440'],
        ['sla_critical', '60'],
        ['sla_high', '240'],
        ['sla_medium', '480'],
        ['sla_low', '1440'],
        ['active_work_states', 'En gestión,Investigando,Resolviendo'],
        ['paused_states', 'Escalado a externo,Esperando respuesta del usuario']
      ];
      
      for (const [key, value] of defaultConfigs) {
        await client.query(`
          UPDATE dashboard_config 
          SET config_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE config_key = $3
        `, [value, userId, key]);
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Configuración restablecida a valores por defecto'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error restableciendo configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;