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

const router = express.Router();

/**
 * POST /api/surveys/:ticketId
 * Crear encuesta de satisfacción para un ticket
 */
router.post('/:ticketId', async (req, res) => {
  const { ticketId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;

  try {
    // Validar rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5 estrellas' });
    }

    // Verificar que el ticket existe y obtener datos para estadísticas
    const ticketResult = await pool.query(`
      SELECT t.id, t.user_id, t.assigned_to, t.area, t.category, t.status,
             t.created_at, t.closed_at,
             EXTRACT(EPOCH FROM (
               COALESCE(
                 (SELECT MIN(th.created_at) FROM ticket_history th 
                  WHERE th.ticket_id = t.id AND th.change_type = 'first_response'),
                 t.closed_at
               ) - t.created_at
             )) / 60 as response_time_minutes,
             EXTRACT(EPOCH FROM (COALESCE(t.closed_at, NOW()) - t.created_at)) / 60 as resolution_time_minutes
      FROM tickets t
      WHERE t.id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const ticket = ticketResult.rows[0];

    // Verificar que el usuario es el creador del ticket o participante
    if (ticket.user_id !== userId) {
      // Verificar si es participante
      const participantCheck = await pool.query(
        'SELECT participants FROM tickets WHERE id = $1',
        [ticketId]
      );
      const participants = participantCheck.rows[0]?.participants || [];
      if (!participants.includes(userId)) {
        return res.status(403).json({ error: 'No tienes permiso para calificar este ticket' });
      }
    }

    // Verificar que el ticket está en estado Resuelto o Cerrado
    if (ticket.status !== 'Resuelto' && ticket.status !== 'Cerrado') {
      return res.status(400).json({ error: 'Solo puedes calificar tickets resueltos o cerrados' });
    }

    // Verificar que no existe ya una encuesta para este ticket
    const existingSurvey = await pool.query(
      'SELECT id FROM ticket_surveys WHERE ticket_id = $1',
      [ticketId]
    );

    if (existingSurvey.rows.length > 0) {
      return res.status(400).json({ error: 'Este ticket ya ha sido calificado' });
    }

    // Insertar encuesta con datos denormalizados para estadísticas
    const result = await pool.query(`
      INSERT INTO ticket_surveys (
        ticket_id, user_id, tech_id, rating, comment, 
        area, category, response_time_minutes, resolution_time_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      ticketId,
      userId,
      ticket.assigned_to,
      rating,
      comment || null,
      ticket.area,
      ticket.category,
      Math.round(ticket.response_time_minutes) || null,
      Math.round(ticket.resolution_time_minutes) || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Gracias por tu calificación',
      survey: result.rows[0]
    });

  } catch (error) {
    console.error('Error creando encuesta:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Este ticket ya ha sido calificado' });
    }
    res.status(500).json({ error: 'Error al guardar la calificación' });
  }
});

/**
 * GET /api/surveys/ticket/:ticketId
 * Obtener encuesta de un ticket específico
 */
router.get('/ticket/:ticketId', async (req, res) => {
  const { ticketId } = req.params;

  try {
    const result = await pool.query(`
      SELECT ts.*, 
             u.firstname as user_firstname, u.lastname as user_lastname,
             t.firstname as tech_firstname, t.lastname as tech_lastname
      FROM ticket_surveys ts
      LEFT JOIN users u ON ts.user_id = u.id
      LEFT JOIN users t ON ts.tech_id = t.id
      WHERE ts.ticket_id = $1
    `, [ticketId]);

    if (result.rows.length === 0) {
      return res.json({ exists: false, survey: null });
    }

    res.json({ exists: true, survey: result.rows[0] });

  } catch (error) {
    console.error('Error obteniendo encuesta:', error);
    res.status(500).json({ error: 'Error al obtener la encuesta' });
  }
});

/**
 * GET /api/surveys/check/:ticketId
 * Verificar si un ticket tiene encuesta (rápido, sin datos completos)
 */
router.get('/check/:ticketId', async (req, res) => {
  const { ticketId } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, rating FROM ticket_surveys WHERE ticket_id = $1',
      [ticketId]
    );

    res.json({
      hasSurvey: result.rows.length > 0,
      rating: result.rows[0]?.rating || null
    });

  } catch (error) {
    console.error('Error verificando encuesta:', error);
    res.status(500).json({ error: 'Error al verificar encuesta' });
  }
});

/**
 * GET /api/surveys/stats
 * Obtener estadísticas generales de encuestas (para dashboard)
 * Solo accesible para tech y admin
 */
router.get('/stats', async (req, res) => {
  const userRole = req.user.role;

  if (userRole !== 'tech' && userRole !== 'admin') {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    // Estadísticas generales
    const generalStats = await pool.query(`
      SELECT 
        COUNT(*) as total_surveys,
        ROUND(AVG(rating)::numeric, 2) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM ticket_surveys
    `);

    // Estadísticas por técnico
    const techStats = await pool.query(`
      SELECT 
        ts.tech_id,
        u.firstname || ' ' || u.lastname as tech_name,
        COUNT(*) as total_surveys,
        ROUND(AVG(ts.rating)::numeric, 2) as average_rating
      FROM ticket_surveys ts
      JOIN users u ON ts.tech_id = u.id
      WHERE ts.tech_id IS NOT NULL
      GROUP BY ts.tech_id, u.firstname, u.lastname
      ORDER BY average_rating DESC
    `);

    // Estadísticas por área
    const areaStats = await pool.query(`
      SELECT 
        area,
        COUNT(*) as total_surveys,
        ROUND(AVG(rating)::numeric, 2) as average_rating
      FROM ticket_surveys
      WHERE area IS NOT NULL
      GROUP BY area
      ORDER BY total_surveys DESC
    `);

    // Estadísticas por categoría
    const categoryStats = await pool.query(`
      SELECT 
        category,
        COUNT(*) as total_surveys,
        ROUND(AVG(rating)::numeric, 2) as average_rating
      FROM ticket_surveys
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY total_surveys DESC
    `);

    // Tendencia mensual (últimos 6 meses)
    const trendStats = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as total_surveys,
        ROUND(AVG(rating)::numeric, 2) as average_rating
      FROM ticket_surveys
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month ASC
    `);

    res.json({
      general: generalStats.rows[0],
      byTechnician: techStats.rows,
      byArea: areaStats.rows,
      byCategory: categoryStats.rows,
      trend: trendStats.rows
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * GET /api/surveys/pending
 * Obtener tickets del usuario con encuesta pendiente
 */
router.get('/pending', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(`
      SELECT t.id, t.title, t.status, t.closed_at, t.area, t.category
      FROM tickets t
      LEFT JOIN ticket_surveys ts ON t.id = ts.ticket_id
      WHERE (t.user_id = $1 OR $1 = ANY(t.participants))
        AND t.status IN ('Resuelto', 'Cerrado')
        AND ts.id IS NULL
      ORDER BY t.closed_at DESC NULLS LAST
      LIMIT 10
    `, [userId]);

    res.json({
      pending: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo encuestas pendientes:', error);
    res.status(500).json({ error: 'Error al obtener encuestas pendientes' });
  }
});

export default router;
