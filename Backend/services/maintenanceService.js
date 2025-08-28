/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * NUEVO MÓDULO DE MANTENIMIENTO - ARQUITECTURA SIMPLIFICADA
 * Diseño: Una tabla, estados simples, lógica robusta
 */

// Configuración del módulo de mantenimiento
const MAINTENANCE_CONFIG = {
  // Tiempo máximo sin heartbeat antes de considerar desconectado
  MAX_INACTIVE_TIME: 5 * 60 * 1000, // 5 minutos
  
  // Intervalo de validación de consistencia
  CONSISTENCY_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutos
  
  // Roles por defecto permitidos durante mantenimiento
  DEFAULT_ALLOWED_ROLES: ['admin'],
  
  // Mensaje por defecto
  DEFAULT_MESSAGE: 'Sistema en mantenimiento. Disculpe las molestias.'
};

class MaintenanceService {
  constructor(pool = null) {
    this.pool = pool;
    this.socketIO = null;
    this.consistencyInterval = null;
    
    // Solo inicializar validación si tenemos pool
    if (this.pool) {
      this.initializeConsistencyCheck();
    }
  }

  /**
   * Configurar la conexión a la base de datos
   */
  setPool(pool) {
    this.pool = pool;
    
    // Inicializar validación periódica si no estaba inicializada
    if (!this.consistencyInterval) {
      this.initializeConsistencyCheck();
    }
  }

  /**
   * Configurar Socket.IO para notificaciones en tiempo real
   */
  setSocketIO(io) {
    this.socketIO = io;
    console.log('🔌 Socket.IO configurado para MaintenanceService');
  }

  /**
   * Obtener el estado actual del sistema de mantenimiento
   * @returns {Object} Estado completo del sistema
   */
  async getCurrentStatus() {
    const client = await this.pool.connect();
    try {
      // Buscar sesión activa o programada
      const result = await client.query(`
        SELECT * FROM maintenance_sessions 
        WHERE status IN ('active', 'scheduled')
        ORDER BY 
          CASE WHEN status = 'active' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return {
          isActive: false,
          isScheduled: false,
          status: 'inactive',
          session: null,
          message: null,
          allowedRoles: [],
          endTime: null
        };
      }

      const session = result.rows[0];
      const isActive = session.status === 'active';
      const isScheduled = session.status === 'scheduled';

      return {
        isActive,
        isScheduled,
        status: session.status,
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          scheduledStart: session.scheduled_start,
          scheduledEnd: session.scheduled_end,
          actualStart: session.actual_start,
          actualEnd: session.actual_end,
          createdAt: session.created_at
        },
        message: session.maintenance_message,
        allowedRoles: session.allowed_roles || MAINTENANCE_CONFIG.DEFAULT_ALLOWED_ROLES,
        endTime: session.scheduled_end || session.actual_end
      };

    } catch (error) {
      console.error('❌ Error obteniendo estado de mantenimiento:', error);
      // En caso de error, asumir sistema activo (fail-safe)
      return {
        isActive: false,
        isScheduled: false,
        status: 'inactive',
        session: null,
        message: 'Error verificando estado del sistema',
        allowedRoles: [],
        endTime: null,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Programar un mantenimiento futuro
   * @param {Object} data - Datos del mantenimiento a programar
   * @returns {Object} Resultado de la operación
   */
  async scheduleMaintenance(data) {
    const client = await this.pool.connect();
    try {
      const {
        title,
        description,
        scheduledStart,
        scheduledEnd,
        allowedRoles = MAINTENANCE_CONFIG.DEFAULT_ALLOWED_ROLES,
        maintenanceMessage = MAINTENANCE_CONFIG.DEFAULT_MESSAGE,
        createdBy
      } = data;

      // Validaciones
      if (!title || !scheduledStart || !scheduledEnd) {
        throw new Error('Título, fecha de inicio y fin son requeridos');
      }

      const startDate = new Date(scheduledStart);
      const endDate = new Date(scheduledEnd);
      const now = new Date();

      if (startDate <= now) {
        throw new Error('La fecha de inicio debe ser futura');
      }

      if (endDate <= startDate) {
        throw new Error('La fecha de fin debe ser posterior al inicio');
      }

      // Verificar que no haya otro mantenimiento activo o programado
      const existingResult = await client.query(`
        SELECT id, status FROM maintenance_sessions 
        WHERE status IN ('active', 'scheduled')
      `);

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        throw new Error(`Ya existe un mantenimiento ${existing.status}. Cancélelo antes de programar uno nuevo.`);
      }

      // Crear nueva sesión programada
      const insertResult = await client.query(`
        INSERT INTO maintenance_sessions (
          title, description, scheduled_start, scheduled_end,
          status, allowed_roles, maintenance_message, created_by
        )
        VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7)
        RETURNING *
      `, [title, description, startDate, endDate, allowedRoles, maintenanceMessage, createdBy]);

      const newSession = insertResult.rows[0];

      console.log(`📅 Mantenimiento programado: ${title} desde ${startDate.toISOString()} hasta ${endDate.toISOString()}`);

      // Notificar via WebSocket
      this.broadcastMaintenanceUpdate('scheduled', newSession);

      return {
        success: true,
        message: 'Mantenimiento programado exitosamente',
        session: this.formatSession(newSession)
      };

    } catch (error) {
      console.error('❌ Error programando mantenimiento:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Iniciar un mantenimiento (manual o automático)
   * @param {number} sessionId - ID de la sesión a iniciar
   * @param {boolean} isAutomatic - Si es inicio automático
   * @returns {Object} Resultado de la operación
   */
  async startMaintenance(sessionId, isAutomatic = false) {
    const client = await this.pool.connect();
    try {
      // Verificar que la sesión existe y está en estado 'scheduled' o 'inactive'
      const sessionResult = await client.query(`
        SELECT * FROM maintenance_sessions 
        WHERE id = $1 AND status IN ('scheduled', 'inactive')
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Sesión no encontrada o no se puede iniciar');
      }

      const session = sessionResult.rows[0];
      
      // Actualizar estado a 'active' y registrar hora de inicio real
      const updateResult = await client.query(`
        UPDATE maintenance_sessions 
        SET status = 'active', 
            actual_start = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [sessionId]);

      const updatedSession = updateResult.rows[0];

      const startType = isAutomatic ? 'automático' : 'manual';
      console.log(`🚧 Mantenimiento iniciado (${startType}): ${session.title}`);

      // Notificar via WebSocket a todos los clientes conectados
      this.broadcastMaintenanceUpdate('started', updatedSession);

      return {
        success: true,
        message: `Mantenimiento iniciado exitosamente (${startType})`,
        session: this.formatSession(updatedSession)
      };

    } catch (error) {
      console.error('❌ Error iniciando mantenimiento:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Finalizar un mantenimiento
   * @param {number} sessionId - ID de la sesión a finalizar
   * @param {boolean} isAutomatic - Si es finalización automática
   * @returns {Object} Resultado de la operación
   */
  async endMaintenance(sessionId, isAutomatic = false) {
    const client = await this.pool.connect();
    try {
      // Verificar que la sesión existe y está activa
      const sessionResult = await client.query(`
        SELECT * FROM maintenance_sessions 
        WHERE id = $1 AND status = 'active'
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Sesión no encontrada o no está activa');
      }

      const session = sessionResult.rows[0];
      
      // Actualizar estado a 'inactive' y registrar hora de fin real
      const updateResult = await client.query(`
        UPDATE maintenance_sessions 
        SET status = 'inactive', 
            actual_end = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [sessionId]);

      const updatedSession = updateResult.rows[0];

      const endType = isAutomatic ? 'automático' : 'manual';
      console.log(`✅ Mantenimiento finalizado (${endType}): ${session.title}`);

      // Notificar via WebSocket a todos los clientes conectados
      this.broadcastMaintenanceUpdate('ended', updatedSession);

      return {
        success: true,
        message: `Mantenimiento finalizado exitosamente (${endType})`,
        session: this.formatSession(updatedSession)
      };

    } catch (error) {
      console.error('❌ Error finalizando mantenimiento:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener historial de mantenimientos
   * @param {number} limit - Límite de resultados
   * @param {number} offset - Offset para paginación
   * @returns {Object} Historial paginado
   */
  async getMaintenanceHistory(limit = 20, offset = 0) {
    const client = await this.pool.connect();
    try {
      // Obtener total de registros
      const countResult = await client.query(`
        SELECT COUNT(*) as total FROM maintenance_sessions
      `);
      const total = parseInt(countResult.rows[0].total);

      // Obtener registros paginados
      const result = await client.query(`
        SELECT ms.*, u.firstname || ' ' || u.lastname as created_by_name
        FROM maintenance_sessions ms
        LEFT JOIN users u ON ms.created_by = u.id
        ORDER BY ms.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return {
        sessions: result.rows.map(session => this.formatSession(session)),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };

    } catch (error) {
      console.error('❌ Error obteniendo historial:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validar consistencia del sistema y corregir estados inconsistentes
   */
  async validateSystemConsistency() {
    const client = await this.pool.connect();
    try {
      const now = new Date();
      
      // 1. Buscar mantenimientos programados que deberían haber iniciado
      const overdueScheduled = await client.query(`
        SELECT * FROM maintenance_sessions 
        WHERE status = 'scheduled' 
        AND scheduled_start <= $1
      `, [now]);

      for (const session of overdueScheduled.rows) {
        console.log(`🔄 Iniciando mantenimiento programado automáticamente: ${session.title}`);
        await this.startMaintenance(session.id, true);
      }

      // 2. Buscar mantenimientos activos que deberían haber terminado
      const overdueActive = await client.query(`
        SELECT * FROM maintenance_sessions 
        WHERE status = 'active' 
        AND scheduled_end IS NOT NULL 
        AND scheduled_end <= $1
      `, [now]);

      for (const session of overdueActive.rows) {
        console.log(`🔄 Finalizando mantenimiento programado automáticamente: ${session.title}`);
        await this.endMaintenance(session.id, true);
      }

      // 3. Verificar múltiples sesiones activas (no debería pasar)
      const multipleSessions = await client.query(`
        SELECT COUNT(*) as count FROM maintenance_sessions 
        WHERE status IN ('active', 'scheduled')
      `);

      if (parseInt(multipleSessions.rows[0].count) > 1) {
        console.warn('⚠️ Múltiples sesiones activas detectadas - requiere intervención manual');
      }

      return { success: true, message: 'Validación de consistencia completada' };

    } catch (error) {
      console.error('❌ Error en validación de consistencia:', error);
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Inicializar chequeo periódico de consistencia
   */
  initializeConsistencyCheck() {
    if (this.consistencyInterval) {
      clearInterval(this.consistencyInterval);
    }

    this.consistencyInterval = setInterval(async () => {
      try {
        await this.validateSystemConsistency();
      } catch (error) {
        console.error('❌ Error en chequeo de consistencia periódico:', error);
      }
    }, MAINTENANCE_CONFIG.CONSISTENCY_CHECK_INTERVAL);

    console.log('🔄 Chequeo de consistencia periódico inicializado cada 5 minutos');
  }

  /**
   * Enviar actualizaciones via WebSocket
   * @param {string} eventType - Tipo de evento
   * @param {Object} session - Datos de la sesión
   */
  broadcastMaintenanceUpdate(eventType, session) {
    if (this.socketIO) {
      const eventData = {
        type: eventType,
        session: this.formatSession(session),
        timestamp: new Date().toISOString()
      };

      this.socketIO.emit(`maintenance:${eventType}`, eventData);
      console.log(`📡 WebSocket: maintenance:${eventType} enviado`);
    }
  }

  /**
   * Formatear sesión para respuesta API
   * @param {Object} session - Sesión de base de datos
   * @returns {Object} Sesión formateada
   */
  formatSession(session) {
    return {
      id: session.id,
      title: session.title,
      description: session.description,
      status: session.status,
      scheduledStart: session.scheduled_start,
      scheduledEnd: session.scheduled_end,
      actualStart: session.actual_start,
      actualEnd: session.actual_end,
      allowedRoles: session.allowed_roles || MAINTENANCE_CONFIG.DEFAULT_ALLOWED_ROLES,
      maintenanceMessage: session.maintenance_message,
      createdBy: session.created_by,
      createdByName: session.created_by_name,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  /**
   * Limpiar recursos al cerrar
   */
  async cleanup() {
    if (this.consistencyInterval) {
      clearInterval(this.consistencyInterval);
    }
    await this.pool.end();
    console.log('🧹 MaintenanceService recursos liberados');
  }
}

// Instancia singleton
const maintenanceService = new MaintenanceService();

export { maintenanceService as default };