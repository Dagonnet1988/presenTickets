/**
 * Rutas para configuración y obtención de settings del dashboard unificado
 * Copyright (c) 2025 Diego Sánchez
 */

import express from "express";
import { pool } from "../server.js";

const router = express.Router();

// Middleware para verificar rol de admin/tech
function requireTechOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'tech')) {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de técnico o administrador.' });
  }
  next();
}


// Middleware solo admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Solo el administrador puede modificar la configuración global.' });
  }
  next();
}

// Obtener configuración global del dashboard (solo admin, se asume un único registro global)
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM dashboard_settings LIMIT 1`);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No hay configuración global del dashboard.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener settings globales del dashboard:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Crear o actualizar configuración global del dashboard (solo admin)
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const { kpis, work_hours, dashboard_layout } = req.body;
    // Se asume un único registro global (user_id = NULL)
    const result = await pool.query(
      `INSERT INTO dashboard_settings (user_id, kpis, work_hours, dashboard_layout, updated_at)
       VALUES (NULL, $1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET kpis = $1, work_hours = $2, dashboard_layout = $3, updated_at = NOW()
       RETURNING *`,
      [kpis || {}, work_hours || {}, dashboard_layout || {}]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al guardar settings globales del dashboard:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
