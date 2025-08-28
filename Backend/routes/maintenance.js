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
import maintenanceService from '../services/maintenanceService.js';
import whatsappService from '../services/whatsappService.js';
import { authMiddleware } from './auth.js';

const router = express.Router();

// Middleware para verificar rol de administrador
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Acceso denegado. Se requieren permisos de administrador.' 
    });
  }
  next();
}

// Middleware para verificar permisos de mantenimiento (admin o roles específicos)
function requireMaintenancePermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Token de autorización requerido' });
  }
  
  const allowedRoles = ['admin', 'tech']; // Roles granulares
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      message: 'Acceso denegado. Permisos insuficientes para mantenimiento.' 
    });
  }
  next();
}

// GET /api/maintenance/status - Obtener estado actual del mantenimiento
router.get('/status', async (req, res) => {
  try {
    const status = await maintenanceService.getCurrentStatus();
    res.json(status);
  } catch (error) {
    console.error('Error obteniendo estado de mantenimiento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// GET /api/maintenance/schedules - Listar mantenimientos programados
router.get('/schedules', authMiddleware, requireMaintenancePermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, limit = 50, offset = 0, includeCompleted = false } = req.query;
    
    let whereClause = '';
    let params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      whereClause += `WHERE ms.status = $${paramCount}`;
      params.push(status);
    } else if (!includeCompleted) {
      whereClause += `WHERE ms.status IN ('scheduled', 'active', 'cancelled')`;
    }

    const query = `
      SELECT 
        ms.*,
        u.username as created_by_name,
        u.firstname as created_by_firstname,
        u.lastname as created_by_lastname
      FROM maintenance_sessions ms
      LEFT JOIN users u ON ms.created_by = u.id
      ${whereClause}
      ORDER BY ms.scheduled_start DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await client.query(query, params);

    // Obtener count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM maintenance_sessions ms
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params.slice(0, -2));

    res.json({
      maintenances: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error obteniendo mantenimientos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /api/maintenance/schedule - Programar nuevo mantenimiento
router.post('/schedule', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      scheduledStart,
      durationMinutes,
      isEmergency = false,
      maintenanceType = 'regular',
      affectedServices = '',
      maintenanceMessage = '',
      allowedRoles = maintenanceService.getDefaultAllowedRoles(),
      notifyUsers = true
    } = req.body;

    // Validaciones
    if (!title || !scheduledStart || !durationMinutes) {
      return res.status(400).json({ 
        message: 'Título, fecha de inicio y duración son requeridos.' 
      });
    }

    if (durationMinutes < 1 || durationMinutes > 1440) { // Max 24 horas
      return res.status(400).json({ 
        message: 'La duración debe estar entre 1 minuto y 24 horas.' 
      });
    }

    const startDate = new Date(scheduledStart);
    if (!isEmergency && startDate <= new Date()) {
      return res.status(400).json({ 
        message: 'La fecha de inicio debe ser futura para mantenimientos programados.' 
      });
    }

    const maintenanceData = {
      title,
      description,
      scheduledStart: startDate,
      durationMinutes: parseInt(durationMinutes),
      isEmergency,
      maintenanceType,
      affectedServices,
      maintenanceMessage: maintenanceMessage || `Mantenimiento programado: ${title}`,
      allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : ['admin'],
      notifyUsers
    };

    const maintenance = await maintenanceService.scheduleMaintenance(
      maintenanceData, 
      req.user.id
    );

    res.status(201).json({
      message: isEmergency ? 'Mantenimiento de emergencia iniciado' : 'Mantenimiento programado exitosamente',
      maintenance: maintenance
    });

  } catch (error) {
    console.error('Error programando mantenimiento:', error);
    res.status(500).json({ 
      message: 'Error programando mantenimiento',
      error: error.message 
    });
  }
});

// POST /api/maintenance/:id/start - Iniciar mantenimiento manualmente
router.post('/:id/start', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const maintenanceId = parseInt(req.params.id);
    
    // Verificar que el mantenimiento existe y está programado
    const checkResult = await client.query(`
      SELECT * FROM maintenance_sessions 
      WHERE id = $1 AND status = 'scheduled'
    `, [maintenanceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Mantenimiento no encontrado o no puede ser iniciado' 
      });
    }

    const result = await maintenanceService.startMaintenance(maintenanceId, req.user.id);

    res.json({
      message: 'Mantenimiento iniciado exitosamente',
      maintenance: result.maintenance,
      session: result.session
    });

  } catch (error) {
    console.error('Error iniciando mantenimiento:', error);
    res.status(500).json({ 
      message: 'Error iniciando mantenimiento',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// POST /api/maintenance/:id/end - Finalizar mantenimiento manualmente
router.post('/:id/end', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const maintenanceId = parseInt(req.params.id);
    
    // Verificar que el mantenimiento está activo
    const checkResult = await client.query(`
      SELECT * FROM maintenance_sessions 
      WHERE id = $1 AND status = 'active'
    `, [maintenanceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Mantenimiento no encontrado o no está activo' 
      });
    }

    await maintenanceService.endMaintenance(maintenanceId, req.user.id);

    res.json({
      message: 'Mantenimiento finalizado exitosamente'
    });

  } catch (error) {
    console.error('Error finalizando mantenimiento:', error);
    res.status(500).json({ 
      message: 'Error finalizando mantenimiento',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// PUT /api/maintenance/:id/cancel - Cancelar mantenimiento programado
router.put('/:id/cancel', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const maintenanceId = parseInt(req.params.id);
    
    // Verificar que el mantenimiento puede ser cancelado
    const checkResult = await client.query(`
      SELECT * FROM maintenance_sessions 
      WHERE id = $1 AND status = 'scheduled'
    `, [maintenanceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Mantenimiento no encontrado o no puede ser cancelado' 
      });
    }

    await maintenanceService.cancelMaintenance(maintenanceId, req.user.id);

    res.json({
      message: 'Mantenimiento cancelado exitosamente'
    });

  } catch (error) {
    console.error('Error cancelando mantenimiento:', error);
    res.status(500).json({ 
      message: 'Error cancelando mantenimiento',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// POST /api/maintenance/start - Crear e iniciar mantenimiento inmediato
router.post('/start', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description,
      allowedRoles = ['admin'],
      maintenanceMessage = 'Sistema en mantenimiento. Disculpe las molestias.',
      estimatedDuration = 60 // minutos
    } = req.body;

    // Validaciones
    if (!title || !description) {
      return res.status(400).json({ 
        message: 'Título y descripción son requeridos.' 
      });
    }

    if (estimatedDuration < 1 || estimatedDuration > 1440) { // Max 24 horas
      return res.status(400).json({ 
        message: 'La duración estimada debe estar entre 1 minuto y 24 horas.' 
      });
    }

    // Verificar que no haya otro mantenimiento activo
    const existingResult = await client.query(`
      SELECT id, status FROM maintenance_sessions 
      WHERE status IN ('active', 'scheduled')
    `);

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      return res.status(409).json({ 
        message: `Ya existe un mantenimiento ${existing.status}. Finalícelo antes de iniciar uno nuevo.` 
      });
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + (estimatedDuration * 60 * 1000));

    // Crear nueva sesión de mantenimiento inmediato
    const insertResult = await client.query(`
      INSERT INTO maintenance_sessions (
        title, description, scheduled_start, scheduled_end,
        actual_start, status, allowed_roles, maintenance_message, 
        created_by
      )
      VALUES ($1, $2, $3, $4, $3, 'active', $5, $6, $7)
      RETURNING *
    `, [title, description, now, endTime, allowedRoles, maintenanceMessage, req.user.id]);

    const newSession = insertResult.rows[0];

    console.log(`🚧 Mantenimiento inmediato iniciado: ${title} por ${req.user.username}`);

    // Notificar a través de Socket.IO si está disponible
    const { io } = await import('../server.js');
    if (io) {
      io.emit('maintenance-started', {
        sessionId: newSession.id,
        title: newSession.title,
        message: newSession.maintenance_message,
        allowedRoles: newSession.allowed_roles,
        endTime: newSession.scheduled_end,
        timestamp: new Date().toISOString()
      });
      
      console.log(`📢 Notificación de inicio de mantenimiento enviada por broadcast`);
    }

    res.status(201).json({
      success: true,
      sessionId: newSession.id,
      message: 'Mantenimiento iniciado exitosamente',
      maintenance: newSession
    });

  } catch (error) {
    console.error('Error iniciando mantenimiento inmediato:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error iniciando mantenimiento',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/maintenance/active-users - Obtener usuarios activos en tiempo real
router.get('/active-users', authMiddleware, requireMaintenancePermission, async (req, res) => {
  try {
    console.log('🔍 [USUARIOS ACTIVOS] Solicitando usuarios activos...');
    console.log('🔍 [USUARIOS ACTIVOS] Usuario solicitante:', req.user?.username, 'Rol:', req.user?.role);
    
    const activeUsersData = await maintenanceService.getActiveUsersFromDatabase();
    
    console.log('🔍 [USUARIOS ACTIVOS] Datos obtenidos del servicio:', {
      totalUsuarios: activeUsersData.users.length,
      socketsConectados: activeUsersData.connectedUsers.length,
      stats: activeUsersData.stats
    });
    
    const response = {
      count: activeUsersData.stats.total,
      connectedSockets: activeUsersData.stats.connectedSockets,
      users: activeUsersData.users,
      connectedUsers: activeUsersData.connectedUsers,
      stats: activeUsersData.stats,
      timestamp: activeUsersData.timestamp
    };
    
    console.log('🔍 [USUARIOS ACTIVOS] Respuesta enviada:', {
      count: response.count,
      connectedSockets: response.connectedSockets,
      usersLength: response.users.length,
      statsTotal: response.stats.total
    });
    
    res.json(response);

  } catch (error) {
    console.error('❌ [USUARIOS ACTIVOS] Error obteniendo usuarios activos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// GET /api/maintenance/history - Obtener historial de mantenimientos
router.get('/history', (req, res, next) => {
  console.log('🔍 DEBUG /history - Headers:', req.headers.authorization ? 'Token presente' : 'Token ausente');
  console.log('🔍 DEBUG /history - URL:', req.url);
  next();
}, authMiddleware, requireMaintenancePermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      limit = 10, 
      offset = 0, 
      status = null, 
      startDate = null, 
      endDate = null 
    } = req.query;

    // Construir query base
    let query = `
      SELECT 
        id,
        title,
        description,
        status,
        scheduled_start AS "scheduledStart",
        scheduled_end AS "scheduledEnd",
        actual_start AS "actualStart",
        actual_end AS "actualEnd",
        created_by AS "createdBy",
        allowed_roles AS "allowedRoles",
        maintenance_message AS "maintenanceMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM maintenance_sessions
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 0;

    // Filtros opcionales
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    if (startDate) {
      paramCount++;
      query += ` AND scheduled_start >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND scheduled_end <= $${paramCount}`;
      queryParams.push(endDate);
    }

    // Ordenar por fecha de creación (más recientes primero)
    query += ` ORDER BY created_at DESC`;

    // Paginación
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(parseInt(offset));

    // Ejecutar query
    const result = await client.query(query, queryParams);

    // Query para contar total de registros
    let countQuery = `SELECT COUNT(*) as total FROM maintenance_sessions WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND scheduled_start >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND scheduled_end <= $${countParamCount}`;
      countParams.push(endDate);
    }

    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      sessions: result.rows,
      total,
      page: Math.floor(offset / limit) + 1,
      limit: parseInt(limit),
      hasMore: (parseInt(offset) + parseInt(limit)) < total
    });

  } catch (error) {
    console.error('Error obteniendo historial de mantenimientos:', error);
    res.status(500).json({ 
      message: 'Error obteniendo historial de mantenimientos',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/maintenance/:id - Obtener detalles de un mantenimiento específico
router.get('/:id', authMiddleware, requireMaintenancePermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const maintenanceId = parseInt(req.params.id);
    
    // Validar que el ID sea un número válido
    if (isNaN(maintenanceId)) {
      return res.status(400).json({ message: 'ID de mantenimiento inválido' });
    }

    const maintenanceResult = await client.query(`
      SELECT 
        ms.*,
        u.username as created_by_name,
        u.firstname as created_by_firstname,
        u.lastname as created_by_lastname
      FROM maintenance_sessions ms
      LEFT JOIN users u ON ms.created_by = u.id
      WHERE ms.id = $1
    `, [maintenanceId]);

    if (maintenanceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mantenimiento no encontrado' });
    }

    // Obtener sesiones relacionadas
    const sessionsResult = await client.query(`
      SELECT 
        mses.*,
        us.username as started_by_name,
        ue.username as ended_by_name
      FROM maintenance_sessions mses
      LEFT JOIN users us ON mses.started_by = us.id
      LEFT JOIN users ue ON mses.ended_by = ue.id
      WHERE mses.schedule_id = $1
      ORDER BY mses.created_at DESC
    `, [maintenanceId]);

    // Obtener notificaciones relacionadas
    const notificationsResult = await client.query(`
      SELECT 
        mn.*,
        u.username as user_name
      FROM maintenance_notifications mn
      LEFT JOIN users u ON mn.user_id = u.id
      WHERE mn.maintenance_id = $1
      ORDER BY mn.created_at DESC
      LIMIT 100
    `, [maintenanceId]);

    res.json({
      maintenance: maintenanceResult.rows[0],
      sessions: sessionsResult.rows,
      notifications: notificationsResult.rows
    });

  } catch (error) {
    console.error('Error obteniendo detalles del mantenimiento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /api/maintenance/:id/extend - Extender duración del mantenimiento
router.post('/:id/extend', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const maintenanceId = parseInt(req.params.id);
    const { additionalMinutes } = req.body;

    if (!additionalMinutes || additionalMinutes < 1 || additionalMinutes > 240) {
      return res.status(400).json({ 
        message: 'Tiempo adicional debe estar entre 1 y 240 minutos' 
      });
    }

    // Verificar que el mantenimiento está activo
    const checkResult = await client.query(`
      SELECT * FROM maintenance_sessions 
      WHERE id = $1 AND status = 'active'
    `, [maintenanceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Mantenimiento no encontrado o no está activo' 
      });
    }

    const maintenance = checkResult.rows[0];
    const newEndTime = new Date(new Date(maintenance.scheduled_end).getTime() + (additionalMinutes * 60 * 1000));
    const newDurationSeconds = maintenance.duration_seconds + (additionalMinutes * 60);

    // Actualizar mantenimiento
    await client.query(`
      UPDATE maintenance_sessions 
      SET scheduled_end = $1, duration_seconds = $2, updated_at = NOW()
      WHERE id = $3
    `, [newEndTime, newDurationSeconds, maintenanceId]);

    // Actualizar estado interno del servicio
    if (maintenanceService.activeMaintenance?.id === maintenanceId) {
      maintenanceService.maintenanceStatus.endTime = newEndTime;
      maintenanceService.activeMaintenance.scheduled_end = newEndTime.toISOString();
      maintenanceService.activeMaintenance.duration_seconds = newDurationSeconds;
    }

    // Notificar a todos los usuarios conectados sobre la extensión
    const { io } = await import('../server.js');
    if (io) {
      // Usar SOLO broadcast para evitar mensajes duplicados
      // El broadcast llegará a todos los sockets conectados
      io.emit('maintenance-extended', {
        maintenanceId: maintenanceId,
        additionalMinutes: additionalMinutes,
        newEndTime: newEndTime.toISOString(),
        totalDurationMinutes: Math.round(newDurationSeconds / 60),
        message: `Mantenimiento extendido por ${additionalMinutes} minutos adicionales`,
        timestamp: new Date().toISOString(),
        maintenance: {
          id: maintenanceId,
          scheduled_end: newEndTime.toISOString(),
          duration_seconds: newDurationSeconds
        }
      });
      
      console.log(`📢 Extensión de mantenimiento enviada por broadcast a todos los usuarios conectados`);
    }

    res.json({
      message: `Mantenimiento extendido por ${additionalMinutes} minutos`,
      newEndTime: newEndTime,
      totalDurationMinutes: Math.round(newDurationSeconds / 60)
    });

  } catch (error) {
    console.error('Error extendiendo mantenimiento:', error);
    res.status(500).json({ 
      message: 'Error extendiendo mantenimiento',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/maintenance/reports/summary - Obtener resumen de mantenimientos
router.get('/reports/summary', authMiddleware, requireMaintenancePermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE ms.created_at BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    const summaryResult = await client.query(`
      SELECT 
        COUNT(*) as total_maintenances,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN is_emergency = true THEN 1 END) as emergency,
        AVG(duration_seconds) as avg_duration_seconds,
        SUM(duration_seconds) as total_duration_seconds
      FROM maintenance_sessions ms
      ${dateFilter}
    `, params);

    const typeBreakdownResult = await client.query(`
      SELECT 
        maintenance_type,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration
      FROM maintenance_sessions ms
      ${dateFilter}
      GROUP BY maintenance_type
      ORDER BY count DESC
    `, params);

    const monthlyStatsResult = await client.query(`
      SELECT 
        DATE_TRUNC('month', scheduled_start) as month,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration
      FROM maintenance_sessions ms
      ${dateFilter}
      GROUP BY DATE_TRUNC('month', scheduled_start)
      ORDER BY month DESC
      LIMIT 12
    `, params);

    res.json({
      summary: summaryResult.rows[0],
      typeBreakdown: typeBreakdownResult.rows,
      monthlyStats: monthlyStatsResult.rows,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Error generando reporte de mantenimientos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /api/maintenance/notify-manual - Enviar notificación manual por WhatsApp
router.post('/notify-manual', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { message, userIds, sendToAll = false } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        message: 'El mensaje es requerido' 
      });
    }

    if (!sendToAll && (!userIds || !Array.isArray(userIds) || userIds.length === 0)) {
      return res.status(400).json({ 
        message: 'Se requiere lista de usuarios o marcar sendToAll' 
      });
    }

    let usersToNotify = [];
    
    if (sendToAll) {
      // Obtener todos los usuarios con teléfono
      const usersResult = await client.query(`
        SELECT id, username, phone, firstname, lastname
        FROM users 
        WHERE status = true AND phone IS NOT NULL AND phone != ''
      `);
      usersToNotify = usersResult.rows;
    } else {
      // Obtener usuarios específicos
      const usersResult = await client.query(`
        SELECT id, username, phone, firstname, lastname
        FROM users 
        WHERE id = ANY($1) AND status = true AND phone IS NOT NULL AND phone != ''
      `, [userIds]);
      usersToNotify = usersResult.rows;
    }

    console.log(`📱 [MAINTENANCE] Enviando ${usersToNotify.length} mensajes manuales de WhatsApp...`);
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];

    // Enviar notificaciones WhatsApp
    for (const user of usersToNotify) {
      try {
        await whatsappService.sendMessage(user.phone, message);
        
        // 🔧 AGREGAR: Registrar notificación en BD
        await client.query(`
          INSERT INTO maintenance_notifications (
            maintenance_id, user_id, notification_type, channel,
            message, phone_number, status, sent_at
          ) VALUES ($1, $2, $3, 'whatsapp', $4, $5, 'sent', NOW())
        `, [null, user.id, 'manual', message, user.phone]); // maintenance_id = null para mensajes manuales
        
        console.log(`✅ [MAINTENANCE] Mensaje enviado y guardado para ${user.username} (${user.phone})`);
        
        results.push({
          userId: user.id,
          username: `${user.firstname} ${user.lastname}`,
          phone: user.phone,
          status: 'sent',
          error: null
        });
        
        successCount++;
      } catch (error) {
        console.error(`❌ [MAINTENANCE] Error enviando a ${user.username} (${user.phone}):`, error.message);
        
        // 🔧 AGREGAR: Registrar error en BD también
        try {
          await client.query(`
            INSERT INTO maintenance_notifications (
              maintenance_id, user_id, notification_type, channel,
              message, phone_number, status, error_message, sent_at
            ) VALUES ($1, $2, $3, 'whatsapp', $4, $5, 'failed', $6, NOW())
          `, [null, user.id, 'manual', message, user.phone, error.message]);
        } catch (dbError) {
          console.error(`❌ [MAINTENANCE] Error guardando fallo en BD:`, dbError.message);
        }
        
        results.push({
          userId: user.id,
          username: `${user.firstname} ${user.lastname}`,
          phone: user.phone,
          status: 'failed',
          error: error.message
        });
        
        errorCount++;
      }
    }

    console.log(`📊 [MAINTENANCE] Resultado: ${successCount} enviados, ${errorCount} fallidos, todos registrados en BD`);

    res.json({
      message: `Notificaciones enviadas: ${successCount} exitosas, ${errorCount} fallidas (registros guardados en BD)`,
      results: {
        total: usersToNotify.length,
        success: successCount,
        errors: errorCount,
        details: results
      }
    });

  } catch (error) {
    console.error('Error enviando notificación manual:', error);
    res.status(500).json({ 
      message: 'Error enviando notificación manual',
      error: error.message 
    });
  } finally {
    client.release();
  }
});


export { router as default };
