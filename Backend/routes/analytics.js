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

// Obtener análisis predictivo
router.get('/predictive-analysis', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Análisis predictivo basado en datos históricos
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    // Calcular tendencia semanal de tickets
    const weeklyTrendQuery = `
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as tickets_created,
        COUNT(CASE WHEN status IN ('Cerrado', 'Resuelto') THEN 1 END) as tickets_closed
      FROM tickets 
      ${dateFilter}
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
      LIMIT 8
    `;
    
    const weeklyTrend = await pool.query(weeklyTrendQuery, params);
    
    // Predicción simple basada en tendencia
    let expectedTicketsNextWeek = 0;
    if (weeklyTrend.rows.length >= 2) {
      const avgTicketsPerWeek = weeklyTrend.rows.reduce((sum, row) => sum + parseInt(row.tickets_created), 0) / weeklyTrend.rows.length;
      expectedTicketsNextWeek = Math.round(avgTicketsPerWeek);
    }
    
    // Calcular tiempo promedio de resolución
    const avgResolutionQuery = `
      SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600) as avg_hours
      FROM tickets 
      WHERE closed_at IS NOT NULL ${dateFilter ? 'AND ' + dateFilter : ''}
    `;
    
    const avgResolution = await pool.query(avgResolutionQuery, params);
    const expectedResolutionTime = avgResolution.rows[0]?.avg_hours || 0;
    
    // Factores de riesgo
    const riskFactors = [
      {
        factor: 'Tickets sin asignar',
        risk_level: 'medium',
        impact: 'Retraso en tiempos de respuesta',
        probability: 0.4
      },
      {
        factor: 'Alta carga de trabajo',
        risk_level: 'high',
        impact: 'Burnout del equipo',
        probability: 0.3
      }
    ];
    
    // Recomendaciones
    const recommendations = [
      {
        type: 'operational',
        priority: 'high',
        title: 'Optimizar asignación de tickets',
        description: 'Implementar sistema de asignación automática',
        expected_impact: 'Reducción del 20% en tiempo de respuesta',
        estimated_effort: '2-3 semanas'
      }
    ];
    
    res.json({
      expectedTicketsNextWeek,
      expectedResolutionTime: expectedResolutionTime.toFixed(1),
      riskFactors,
      recommendations
    });
    
  } catch (error) {
    console.error('Error en análisis predictivo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener análisis de carga de trabajo
router.get('/workload-analysis', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'AND t.created_at >= $1 AND t.created_at <= $2';
      params = [startDate, endDate];
    }
    
    // Capacidad del equipo
    const teamCapacityQuery = `
      SELECT COUNT(*) as team_size
      FROM users 
      WHERE role IN ('tech', 'admin') AND active = true
    `;
    
    const teamCapacity = await pool.query(teamCapacityQuery);
    const teamSize = teamCapacity.rows[0]?.team_size || 0;
    
    // Carga de trabajo actual
    const workloadQuery = `
      SELECT 
        u.id,
        u.firstname,
        COUNT(t.id) as current_tickets
      FROM users u
      LEFT JOIN tickets t ON u.id = t.assigned_to AND t.status NOT IN ('Cerrado', 'Resuelto') ${dateFilter}
      WHERE u.role IN ('tech', 'admin')
      GROUP BY u.id, u.firstname
      ORDER BY current_tickets DESC
    `;
    
    const workload = await pool.query(workloadQuery, params);
    
    const currentWorkload = workload.rows.reduce((sum, row) => sum + parseInt(row.current_tickets), 0);
    const capacityUtilization = teamSize > 0 ? (currentWorkload / (teamSize * 20)) * 100 : 0; // Asumiendo 20 tickets por técnico como capacidad máxima
    
    // Distribución óptima
    const optimalTicketsPerTech = Math.floor(currentWorkload / teamSize);
    const optimalDistribution = workload.rows.map(row => ({
      tech_id: row.id,
      tech_name: row.firstname,
      current_tickets: parseInt(row.current_tickets),
      recommended_tickets: optimalTicketsPerTech,
      adjustment_needed: optimalTicketsPerTech - parseInt(row.current_tickets)
    }));
    
    res.json({
      team_capacity: teamSize,
      current_workload: currentWorkload,
      capacity_utilization: capacityUtilization.toFixed(1),
      bottlenecks: [], // Implementar lógica de detección de cuellos de botella
      optimal_distribution: optimalDistribution
    });
    
  } catch (error) {
    console.error('Error en análisis de carga de trabajo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener métricas de satisfacción del cliente
router.get('/customer-satisfaction', requireTechOrAdmin, async (req, res) => {
  try {
    // Implementación simplificada - en producción requeriría tabla de feedback
    const mockData = {
      average_rating: 4.2,
      response_satisfaction: 4.1,
      resolution_satisfaction: 4.3,
      communication_satisfaction: 4.0,
      satisfaction_trend: [
        { period: '2025-01', rating: 4.0, responses: 150 },
        { period: '2025-02', rating: 4.1, responses: 165 },
        { period: '2025-03', rating: 4.2, responses: 180 }
      ]
    };
    
    res.json(mockData);
    
  } catch (error) {
    console.error('Error en métricas de satisfacción:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener análisis de costos
router.get('/cost-analysis', requireTechOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Implementación simplificada - en producción requeriría datos de costos reales
    const mockData = {
      total_labor_cost: 15000, // USD por mes
      cost_per_ticket: 45.50,
      cost_by_priority: [
        { priority: 'Urgente', total_cost: 2500, avg_cost_per_ticket: 125.00 },
        { priority: 'Alta', total_cost: 4500, avg_cost_per_ticket: 75.00 },
        { priority: 'Media', total_cost: 5000, avg_cost_per_ticket: 41.67 },
        { priority: 'Baja', total_cost: 3000, avg_cost_per_ticket: 25.00 }
      ],
      cost_efficiency_trend: [
        { period: '2025-01', cost_per_ticket: 50.00, tickets_handled: 300 },
        { period: '2025-02', cost_per_ticket: 47.50, tickets_handled: 315 },
        { period: '2025-03', cost_per_ticket: 45.50, tickets_handled: 330 }
      ]
    };
    
    res.json(mockData);
    
  } catch (error) {
    console.error('Error en análisis de costos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
