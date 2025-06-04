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
import { pool } from "../server.js";
import { calculateDashboardMetrics, calculateTicketTimings } from "../services/timeCalculations.js";

const router = express.Router();

// Middleware para verificar rol de admin/tech
function requireTechOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'tech')) {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de técnico o administrador.' });
  }
  next();
}

// Obtener métricas del dashboard
router.get('/dashboard', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateRange = null;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate),
        end: new Date(endDate)
      };
    }
    
    const metrics = await calculateDashboardMetrics(pool, dateRange);
    res.json(metrics);
    
  } catch (error) {
    console.error('Error al obtener métricas del dashboard:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener estadísticas por estado
router.get('/tickets-by-status', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM tickets 
      ${dateFilter}
      GROUP BY status
      ORDER BY count DESC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener tickets por estado:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener tendencias temporales
router.get('/time-trends', requireTechOrAdmin, async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query;
    
    let dateFormat, interval;
    switch (period) {
      case 'hourly':
        dateFormat = 'YYYY-MM-DD HH24:00:00';
        interval = '1 hour';
        break;
      case 'weekly':
        dateFormat = 'YYYY-"W"WW';
        interval = '1 week';
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        interval = '1 month';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
        interval = '1 day';
    }
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    const query = `
      SELECT 
        TO_CHAR(created_at, '${dateFormat}') as period,
        COUNT(*) as tickets_created,
        COUNT(CASE WHEN status IN ('Cerrado', 'Resuelto') THEN 1 END) as tickets_closed
      FROM tickets 
      ${dateFilter}
      GROUP BY TO_CHAR(created_at, '${dateFormat}')
      ORDER BY period
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener tendencias temporales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener performance por técnico
router.get('/tech-performance', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'AND t.created_at >= $1 AND t.created_at <= $2';
      params = [startDate, endDate];
    }
    
    const query = `
      SELECT 
        u.id,
        u.username,
        u.firstname,
        COUNT(t.id) as total_tickets,
        COUNT(CASE WHEN t.status IN ('Cerrado', 'Resuelto') THEN 1 END) as closed_tickets,
        ROUND(
          COUNT(CASE WHEN t.status IN ('Cerrado', 'Resuelto') THEN 1 END) * 100.0 / 
          NULLIF(COUNT(t.id), 0), 2
        ) as closure_rate,
        AVG(
          CASE 
            WHEN t.closed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600 
          END
        ) as avg_resolution_hours
      FROM users u
      LEFT JOIN tickets t ON u.id = t.assigned_to ${dateFilter}
      WHERE u.role IN ('tech', 'admin')
      GROUP BY u.id, u.username, u.firstname
      HAVING COUNT(t.id) > 0
      ORDER BY closure_rate DESC, total_tickets DESC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener performance por técnico:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener métricas de tiempo para un ticket específico
router.get('/ticket-timing/:id', requireTechOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: 'ID de ticket no válido' });
    }
    
    const metrics = await calculateTicketTimings(pool, parseInt(id, 10));
    res.json(metrics);
    
  } catch (error) {
    console.error('Error al obtener métricas de tiempo del ticket:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener tickets por prioridad
router.get('/tickets-by-priority', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    const query = `
      SELECT 
        priority,
        COUNT(*) as count,
        COUNT(CASE WHEN status IN ('Cerrado', 'Resuelto') THEN 1 END) as closed_count
      FROM tickets 
      ${dateFilter}
      GROUP BY priority
      ORDER BY 
        CASE priority 
          WHEN 'Urgente' THEN 1 
          WHEN 'Alta' THEN 2 
          WHEN 'Media' THEN 3 
          WHEN 'Baja' THEN 4 
          ELSE 5 
        END
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener tickets por prioridad:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener tickets por área/categoría
router.get('/tickets-by-area', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    const query = `
      SELECT 
        area,
        category,
        COUNT(*) as count
      FROM tickets 
      ${dateFilter}
      GROUP BY area, category
      ORDER BY count DESC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener tickets por área:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener resumen de actividad reciente
router.get('/recent-activity', requireTechOrAdmin, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const query = `      SELECT 
        'ticket_created' as activity_type,
        t.id as ticket_id,
        t.title,
        t.created_at as activity_date,
        u.firstname as user_name,
        t.status,
        t.priority
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      
      UNION ALL
        SELECT 
        'comment_added' as activity_type,
        c.ticket_id,
        t.title,
        c.created_at as activity_date,
        u.firstname as user_name,
        t.status,
        t.priority
      FROM comments c
      JOIN tickets t ON c.ticket_id = t.id
      JOIN users u ON c.user_id = u.id
      
      ORDER BY activity_date DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener actividad reciente:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
