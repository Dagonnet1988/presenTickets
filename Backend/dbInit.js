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

import pkg from 'pg';
import { pool } from './db.js';

// Sistema de logging configurable por nivel
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

const logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => currentLogLevel >= LOG_LEVELS.info && console.log(...args),
  debug: (...args) => currentLogLevel >= LOG_LEVELS.debug && console.log(...args)
};

const { Pool } = pkg;
const createDatabaseIfNotExists = async () => {
  const defaultPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    database: 'postgres', // Conexión al esquema predeterminado
  });

  try {
    const client = await defaultPool.connect();
    const dbName = process.env.DB_NAME || 'presentickets';

    // Verificar si la base de datos existe
    const dbExists = await client.query(`
      SELECT 1 FROM pg_database WHERE datname = $1;
    `, [dbName]);

    if (dbExists.rows.length === 0) {
      logger.info(`➕ Creando la base de datos '${dbName}'...`);
      await client.query(`CREATE DATABASE ${dbName};`);
      logger.info(`✅ Base de datos '${dbName}' creada exitosamente.`);
    } else {
      logger.debug(`✅ La base de datos '${dbName}' ya existe.`);
    }

    client.release();
  } catch (error) {
    logger.error("❌ Error al verificar/crear la base de datos:", error);
  } finally {
    await defaultPool.end();
  }
};

const checkAndCreateTables = async () => {
  await createDatabaseIfNotExists(); // Llamar a la función para crear la base de datos si no existe

  const client = await pool.connect();
  try {
    logger.debug("🔍 Verificando estructura de la base de datos...");

    // Validar y crear la tabla "users"
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);

    if (!usersTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'users'...");
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          firstname VARCHAR(255),
          lastname VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(20),
          role VARCHAR(50) NOT NULL,
          status BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      logger.debug("✅ La tabla 'users' ya existe. Verificando columnas...");
      const usersColumns = [
        { name: 'firstname', type: 'VARCHAR(255)' },
        { name: 'lastname', type: 'VARCHAR(255)' },
        { name: 'email', type: 'VARCHAR(255) UNIQUE' },
        { name: 'phone', type: 'VARCHAR(20)' },
        { name: 'status', type: 'BOOLEAN DEFAULT true' },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
      ];
      for (const column of usersColumns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = $1`,
          [column.name]
        );
        if (columnExists.rows.length === 0) {
          logger.info(`➕ Agregando columna '${column.name}' a la tabla 'users'`);
          await client.query(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
        }
      }
    }

    // Validar y crear la tabla "tickets"
    const ticketsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'tickets'
      );
    `);

    if (!ticketsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'tickets'...");
      await client.query(`
        CREATE TABLE tickets (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(100),
          area VARCHAR(255),
          status VARCHAR(50) NOT NULL DEFAULT 'Creado',
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          priority VARCHAR(100),
          assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
          closed_at TIMESTAMP,
          external_ticket_id VARCHAR(100)
        );
      `);
    } else {
      logger.debug("✅ La tabla 'tickets' ya existe. Verificando columnas...");
      
      // Verificar y agregar columna external_ticket_id si no existe
      const externalTicketIdColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'external_ticket_id'`
      );
      if (externalTicketIdColumn.rows.length === 0) {
        logger.info("➕ Agregando columna 'external_ticket_id' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN external_ticket_id VARCHAR(100)`);
      } else {
        logger.debug("✅ La columna 'external_ticket_id' ya existe en la tabla 'tickets'.");
      }
      
      // Verificar y agregar columna participants si no existe
      const participantsColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'participants'`
      );
      if (participantsColumn.rows.length === 0) {
        logger.info("➕ Agregando columna 'participants' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN participants INTEGER[] DEFAULT '{}'`);
        logger.info("✅ Columna 'participants' agregada exitosamente.");
      } else {
        logger.debug("✅ La columna 'participants' ya existe en la tabla 'tickets'.");
      }

      // Verificar y agregar columna updated_at si no existe
      const updatedAtColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'updated_at'`
      );
      if (updatedAtColumn.rows.length === 0) {
        logger.info("➕ Agregando columna 'updated_at' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        
        // Actualizar registros existentes para que tengan updated_at = created_at
        await client.query(`UPDATE tickets SET updated_at = created_at WHERE updated_at IS NULL`);
        logger.info("✅ Columna 'updated_at' agregada y datos existentes actualizados.");
      } else {
        logger.debug("✅ La columna 'updated_at' ya existe en la tabla 'tickets'.");
      }
    }

    // Validar y crear la tabla "comments"
    const commentsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'comments'
      );
    `);

    if (!commentsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'comments'...");
      await client.query(`
        CREATE TABLE comments (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          comment TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      logger.debug("✅ La tabla 'comments' ya existe.");
    }

    // Validar y crear la tabla "attachments"
    const attachmentsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'attachments'
      );
    `);

    if (!attachmentsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'attachments'...");
      await client.query(`
        CREATE TABLE attachments (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          filepath VARCHAR(255) NOT NULL
        );
      `);
    } else {
      logger.debug("✅ La tabla 'attachments' ya existe. Verificando columnas...");
      // Verificar y agregar columna comment_id si no existe
      const commentIdColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'attachments' AND column_name = 'comment_id'`
      );
      if (commentIdColumn.rows.length === 0) {
        logger.info("➕ Agregando columna 'comment_id' a la tabla 'attachments'");
        await client.query(`ALTER TABLE attachments ADD COLUMN comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE`);
      } else {
          logger.debug(`✅ La columna 'comment_id' ya existe en la tabla 'attachments'.`);
        }
    }

    // Validar y crear la tabla "notifications"
    const notificationsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'notifications'
      );
    `);

    if (!notificationsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'notifications'...");
      await client.query(`
        CREATE TABLE notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      logger.debug("✅ La tabla 'notifications' ya existe. Verificando columnas...");
      // Verificar y agregar columnas si faltan
      const columns = [
        { name: 'type', type: 'VARCHAR(50) NOT NULL' },
        { name: 'message', type: 'TEXT NOT NULL' },
        { name: 'ticket_id', type: 'INTEGER REFERENCES tickets(id) ON DELETE CASCADE' },
        { name: 'is_read', type: 'BOOLEAN DEFAULT false' },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        // Columnas para monitoreo de email externo
        { name: 'external_ticket_id', type: 'VARCHAR(100)' },
        { name: 'email_subject', type: 'TEXT' },
        // ID del mensaje de email para notificaciones compartidas
        { name: 'email_message_id', type: 'VARCHAR(255)' }
      ];
      for (const column of columns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'notifications' AND column_name = $1`,
          [column.name]
        );
        if (columnExists.rows.length === 0) {
          logger.info(`➕ Agregando columna '${column.name}' a la tabla 'notifications'`);
          await client.query(`ALTER TABLE notifications ADD COLUMN ${column.name} ${column.type}`);
        }
      }
    }


    // Validar y crear la tabla "whatsapp_notifications"
    const whatsappNotificationsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'whatsapp_notifications'
      );
    `);

    if (!whatsappNotificationsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'whatsapp_notifications'...");
      await client.query(`
        CREATE TABLE whatsapp_notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          notification_type VARCHAR(50) DEFAULT 'unknown',
          status VARCHAR(20) DEFAULT 'pending',
          error_message TEXT,
          phone_number VARCHAR(20),
          sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      logger.debug("✅ La tabla 'whatsapp_notifications' ya existe.");
      
      // Verificar si existe la columna notification_type, si no existe agregarla
      const notificationTypeColumnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'whatsapp_notifications' 
          AND column_name = 'notification_type'
        );
      `);
      
      if (!notificationTypeColumnExists.rows[0].exists) {
        logger.info("➕ Agregando columna 'notification_type' a 'whatsapp_notifications'...");
        await client.query(`
          ALTER TABLE whatsapp_notifications 
          ADD COLUMN notification_type VARCHAR(50) DEFAULT 'unknown';
        `);
        logger.info("✅ Columna 'notification_type' agregada exitosamente.");
      }
    }

    // Validar y crear la tabla "dashboard_settings"
    const dashboardSettingsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'dashboard_settings'
      );
    `);

    if (!dashboardSettingsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'dashboard_settings'...");
      await client.query(`
        CREATE TABLE dashboard_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          kpis JSONB DEFAULT '{}'::jsonb, -- Configuración de KPIs (editable)
          work_hours JSONB DEFAULT '{}'::jsonb, -- Horarios de trabajo (editable)
          dashboard_layout JSONB DEFAULT '{}'::jsonb, -- Configuración visual (opcional)
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info("✅ Tabla 'dashboard_settings' creada exitosamente.");
    } else {
      logger.debug("✅ La tabla 'dashboard_settings' ya existe.");
      // Validar y agregar columnas si faltan
      const dashboardColumns = [
        { name: 'kpis', type: "JSONB DEFAULT '{}'::jsonb" },
        { name: 'work_hours', type: "JSONB DEFAULT '{}'::jsonb" },
        { name: 'dashboard_layout', type: "JSONB DEFAULT '{}'::jsonb" },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
      ];
      for (const column of dashboardColumns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'dashboard_settings' AND column_name = $1`,
          [column.name]
        );
        if (columnExists.rows.length === 0) {
          logger.info(`➕ Agregando columna '${column.name}' a la tabla 'dashboard_settings'`);
          await client.query(`ALTER TABLE dashboard_settings ADD COLUMN ${column.name} ${column.type}`);
        }
      }
    }

    // Validar y crear la tabla "user_preferences_settings"
    const userPreferencesTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_preferences_settings'
      );
    `);

    if (!userPreferencesTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'user_preferences_settings'...");
      await client.query(`
        CREATE TABLE user_preferences_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          whatsapp_enabled BOOLEAN DEFAULT true,
          whatsapp_ticket_created BOOLEAN DEFAULT true,
          whatsapp_ticket_assigned BOOLEAN DEFAULT true,
          whatsapp_ticket_status BOOLEAN DEFAULT true,
          whatsapp_comments BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      logger.debug("✅ La tabla 'user_preferences_settings' ya existe.");
      
      // Actualizar el valor por defecto de whatsapp_enabled a true
      try {
        await client.query(`
          ALTER TABLE user_preferences_settings 
          ALTER COLUMN whatsapp_enabled SET DEFAULT true
        `);
        logger.debug("✅ Valor por defecto de 'whatsapp_enabled' actualizado a true.");
      } catch (error) {
        logger.warn("⚠️ Error actualizando valor por defecto:", error.message);
      }

      // Agregar nuevas columnas de configuración avanzada
      const newColumns = [
        { name: 'notification_schedule', type: 'VARCHAR(20) DEFAULT \'always\'', description: 'Horario de notificaciones' },
        { name: 'notification_start_time', type: 'TIME DEFAULT \'08:00\'', description: 'Hora de inicio de notificaciones' },
        { name: 'notification_end_time', type: 'TIME DEFAULT \'18:00\'', description: 'Hora de fin de notificaciones' },
        { name: 'notification_mode', type: 'VARCHAR(20) DEFAULT \'instant\'', description: 'Modo de notificación' },
        { name: 'min_priority', type: 'VARCHAR(20) DEFAULT \'low\'', description: 'Prioridad mínima' },
        { name: 'weekend_notifications', type: 'BOOLEAN DEFAULT true', description: 'Notificaciones en fines de semana' },
        { name: 'sound_enabled', type: 'BOOLEAN DEFAULT true', description: 'Sonido habilitado' },
        { name: 'daily_limit', type: 'VARCHAR(20) DEFAULT \'unlimited\'', description: 'Límite diario' },
        { name: 'do_not_disturb', type: 'BOOLEAN DEFAULT false', description: 'Modo no molestar' },
        { name: 'do_not_disturb_until', type: 'TIMESTAMP NULL', description: 'No molestar hasta' },
        { name: 'whatsapp_external_email', type: 'BOOLEAN DEFAULT true', description: 'Notificaciones WhatsApp de emails externos' }
        // Las plantillas de WhatsApp ahora son aleatorias en el backend para evitar bloqueos
      ];

      for (const column of newColumns) {
        try {
          // Verificar si la columna existe
          const columnExists = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'user_preferences_settings' 
              AND column_name = $1
            )
          `, [column.name]);

          if (!columnExists.rows[0].exists) {
            await client.query(`
              ALTER TABLE user_preferences_settings 
              ADD COLUMN ${column.name} ${column.type}
            `);
            logger.info(`✅ Columna '${column.name}' agregada: ${column.description}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Error agregando columna '${column.name}':`, error.message);
        }
      }
    }

    // Crear tabla dashboard_config para configuración de metas
    const dashboardConfigExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'dashboard_config'
      );
    `);

    if (!dashboardConfigExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'dashboard_config'...");
      await client.query(`
        CREATE TABLE dashboard_config (
          id SERIAL PRIMARY KEY,
          config_key VARCHAR(50) UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          config_type VARCHAR(20) DEFAULT 'text',
          description TEXT,
          category VARCHAR(30) DEFAULT 'general',
          updated_by INTEGER REFERENCES users(id),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Insertar configuraciones por defecto
      await client.query(`
        INSERT INTO dashboard_config (config_key, config_value, config_type, description, category) VALUES
        ('work_hours_start', '07:00', 'time', 'Hora de inicio laboral', 'schedule'),
        ('work_hours_end', '17:30', 'time', 'Hora de fin laboral (Lunes-Jueves)', 'schedule'),
        ('work_hours_friday_end', '16:30', 'time', 'Hora de fin laboral (Viernes)', 'schedule'),
        ('lunch_break_start', '12:00', 'time', 'Inicio de almuerzo', 'schedule'),
        ('lunch_break_end', '13:30', 'time', 'Fin de almuerzo', 'schedule'),
        ('target_response_time', '240', 'number', 'Meta tiempo de respuesta (minutos)', 'targets'),
        ('target_resolution_time', '1440', 'number', 'Meta tiempo de resolución (minutos)', 'targets'),
        ('sla_critical', '60', 'number', 'SLA prioridad crítica (minutos)', 'sla'),
        ('sla_high', '240', 'number', 'SLA prioridad alta (minutos)', 'sla'),
        ('sla_medium', '480', 'number', 'SLA prioridad media (minutos)', 'sla'),
        ('sla_low', '1440', 'number', 'SLA prioridad baja (minutos)', 'sla'),
        ('active_work_states', 'En gestión,Investigando,Resolviendo', 'array', 'Estados considerados trabajo activo', 'workflow'),
        ('paused_states', 'Escalado a externo,Esperando respuesta del usuario', 'array', 'Estados pausados (no cuentan tiempo)', 'workflow');
      `);
      
      logger.info("✅ Tabla 'dashboard_config' creada con configuraciones por defecto.");
    } else {
      logger.debug("✅ La tabla 'dashboard_config' ya existe.");
    }

    // Crear tabla ticket_history para seguimiento de cambios
    const ticketHistoryExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ticket_history'
      );
    `);

    if (!ticketHistoryExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'ticket_history'...");
      await client.query(`
        CREATE TABLE ticket_history (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          change_type VARCHAR(50) NOT NULL, -- 'status_change', 'assignment', 'priority_change', 'first_response', etc.
          old_value TEXT,
          new_value TEXT,
          description TEXT, -- Descripción legible del cambio
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Crear índices para mejores consultas
      await client.query(`
        CREATE INDEX idx_ticket_history_ticket_id ON ticket_history(ticket_id);
        CREATE INDEX idx_ticket_history_change_type ON ticket_history(change_type);
        CREATE INDEX idx_ticket_history_created_at ON ticket_history(created_at);
      `);
      
      logger.info("✅ Tabla 'ticket_history' creada con índices.");
    } else {
      logger.debug("✅ La tabla 'ticket_history' ya existe.");
    }

    // ==========================================
    // TABLA TICKET_SURVEYS (Encuestas de Satisfacción)
    // ==========================================
    logger.debug("🔧 Verificando tabla 'ticket_surveys'...");
    const ticketSurveysExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ticket_surveys'
      );
    `);

    if (!ticketSurveysExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'ticket_surveys'...");
      await client.query(`
        CREATE TABLE ticket_surveys (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tech_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          area VARCHAR(255),
          category VARCHAR(100),
          response_time_minutes INTEGER,
          resolution_time_minutes INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Crear índices para estadísticas
      await client.query(`
        CREATE INDEX idx_ticket_surveys_rating ON ticket_surveys(rating);
        CREATE INDEX idx_ticket_surveys_tech_id ON ticket_surveys(tech_id);
        CREATE INDEX idx_ticket_surveys_area ON ticket_surveys(area);
        CREATE INDEX idx_ticket_surveys_category ON ticket_surveys(category);
        CREATE INDEX idx_ticket_surveys_created_at ON ticket_surveys(created_at);
      `);
      
      logger.info("✅ Tabla 'ticket_surveys' creada con índices para estadísticas.");
    } else {
      logger.debug("✅ La tabla 'ticket_surveys' ya existe.");
      
      // Migración: añadir columnas faltantes si no existen
      const surveyColumns = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'ticket_surveys'
      `);
      const existingCols = surveyColumns.rows.map(r => r.column_name);

      if (!existingCols.includes('tech_id')) {
        logger.info("➕ Añadiendo columna 'tech_id' a ticket_surveys...");
        await client.query(`ALTER TABLE ticket_surveys ADD COLUMN tech_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
      }
      if (!existingCols.includes('area')) {
        logger.info("➕ Añadiendo columna 'area' a ticket_surveys...");
        await client.query(`ALTER TABLE ticket_surveys ADD COLUMN area VARCHAR(255)`);
      }
      if (!existingCols.includes('category')) {
        logger.info("➕ Añadiendo columna 'category' a ticket_surveys...");
        await client.query(`ALTER TABLE ticket_surveys ADD COLUMN category VARCHAR(100)`);
      }
      if (!existingCols.includes('response_time_minutes')) {
        logger.info("➕ Añadiendo columna 'response_time_minutes' a ticket_surveys...");
        await client.query(`ALTER TABLE ticket_surveys ADD COLUMN response_time_minutes INTEGER`);
      }
      if (!existingCols.includes('resolution_time_minutes')) {
        logger.info("➕ Añadiendo columna 'resolution_time_minutes' a ticket_surveys...");
        await client.query(`ALTER TABLE ticket_surveys ADD COLUMN resolution_time_minutes INTEGER`);
      }
    }

    // Eliminar tabla ticket_participants si existe (ya no se usa)
    const ticketParticipantsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ticket_participants'
      );
    `);

    if (ticketParticipantsTableExists.rows[0].exists) {
      logger.info("🗑️ Eliminando tabla 'ticket_participants' (ya no se usa)...");
      await client.query(`DROP TABLE IF EXISTS ticket_participants CASCADE;`);
      logger.info("✅ Tabla 'ticket_participants' eliminada exitosamente.");
    }

    // ==========================================
    // 8. TABLA SYSTEM_SETTINGS (Configuración Global)
    // ==========================================
    logger.debug("🔧 Verificando tabla 'system_settings'...");
    const systemSettingsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'system_settings'
      );
    `);

    if (!systemSettingsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'system_settings' (configuración global del sistema)...");
      await client.query(`
        CREATE TABLE system_settings (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Solo una fila de configuración
          
          -- Configuraciones generales de WhatsApp
          whatsapp_global_enabled BOOLEAN DEFAULT true,
          whatsapp_global_ticket_created BOOLEAN DEFAULT true,
          whatsapp_global_ticket_assigned BOOLEAN DEFAULT true,
          whatsapp_global_ticket_status BOOLEAN DEFAULT true,
          whatsapp_global_comments BOOLEAN DEFAULT true,
          
          -- Configuraciones de antibloqueo WhatsApp (persistentes)
          whatsapp_min_delay INTEGER DEFAULT 1000,     -- 1 segundo mínimo
          whatsapp_max_delay INTEGER DEFAULT 3000,     -- 3 segundos máximo
          whatsapp_max_hour INTEGER DEFAULT 60,        -- 60 mensajes por hora
          whatsapp_max_daily INTEGER DEFAULT 200,      -- 200 mensajes por día
          whatsapp_max_burst INTEGER DEFAULT 5,        -- 5 mensajes en ráfaga
          
          -- Configuraciones de mantenimiento (futuro uso)
          maintenance_mode BOOLEAN DEFAULT false,
          maintenance_message TEXT DEFAULT 'Sistema en mantenimiento. Disculpe las molestias.',
          
          -- Auditoría
          updated_by INTEGER REFERENCES users(id),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      // Insertar configuración por defecto
      await client.query(`
        INSERT INTO system_settings (
          id,
          whatsapp_global_enabled,
          whatsapp_global_ticket_created,
          whatsapp_global_ticket_assigned,
          whatsapp_global_ticket_status,
          whatsapp_global_comments,
          whatsapp_min_delay,
          whatsapp_max_delay,
          whatsapp_max_hour,
          whatsapp_max_daily,
          whatsapp_max_burst
        ) VALUES (
          1, true, true, true, true, true, 1000, 3000, 60, 200, 5
        );
      `);
      
      logger.info("✅ Tabla 'system_settings' creada exitosamente con configuración por defecto.");
    } else {
      logger.debug("✅ La tabla 'system_settings' ya existe.");
      
      // Verificar y agregar columnas de antibloqueo / configuración si no existen
      const antiblockColumns = [
        { name: 'whatsapp_min_delay', type: 'INTEGER DEFAULT 1000' },
        { name: 'whatsapp_max_delay', type: 'INTEGER DEFAULT 3000' },
        { name: 'whatsapp_max_hour', type: 'INTEGER DEFAULT 60' },
        { name: 'whatsapp_max_daily', type: 'INTEGER DEFAULT 200' },
        { name: 'whatsapp_max_burst', type: 'INTEGER DEFAULT 5' },
        // Alcance de destinatarios de WhatsApp: 'all' (todos) | 'tech_only' (solo técnicos)
        { name: 'whatsapp_recipient_scope', type: "VARCHAR(20) DEFAULT 'all'" },
        // Máximo de tickets en "Esperando respuesta del usuario" que un usuario puede
        // tener antes de que se le impida crear tickets nuevos.
        { name: 'max_pending_user_tickets', type: 'INTEGER DEFAULT 3' }
      ];
      
      for (const column of antiblockColumns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'system_settings' AND column_name = $1`,
          [column.name]
        );
        
        if (columnExists.rows.length === 0) {
          logger.info(`➕ Agregando columna '${column.name}' a 'system_settings'...`);
          await client.query(`ALTER TABLE system_settings ADD COLUMN ${column.name} ${column.type};`);
          logger.info(`✅ Columna '${column.name}' agregada exitosamente.`);
        }
      }
    }

    // ==========================================
    // 9. TABLA MAINTENANCE_STATUS (Simplificada)
    // ==========================================
    // Eliminar tabla compleja si existe
    await client.query(`DROP TABLE IF EXISTS maintenance_sessions CASCADE;`);

    // Verificar si la tabla existe
    const maintenanceTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'maintenance_status'
      );
    `);

    if (!maintenanceTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'maintenance_status' (versión simplificada)...");
      await client.query(`
        CREATE TABLE maintenance_status (
          id SERIAL PRIMARY KEY,
          is_active BOOLEAN DEFAULT false,
          message TEXT DEFAULT 'Sistema en mantenimiento. Disculpe las molestias.',
          countdown_seconds INTEGER DEFAULT 0,
          started_by INTEGER REFERENCES users(id),
          started_at TIMESTAMP,
          ended_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      // Insertar registro inicial
      await client.query(`
        INSERT INTO maintenance_status (is_active) VALUES (false);
      `);
      logger.info("✅ Tabla 'maintenance_status' creada exitosamente (versión simple).");
    } else {
      logger.debug("✅ La tabla 'maintenance_status' ya existe.");
    }

    // Validar y crear la tabla "processed_emails" para el monitor de correo
    const processedEmailsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'processed_emails'
      );
    `);

    if (!processedEmailsTableExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'processed_emails'...");
      await client.query(`
        CREATE TABLE processed_emails (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255) UNIQUE NOT NULL,
          external_ticket_id VARCHAR(100),
          subject TEXT,
          from_address VARCHAR(255),
          processed_at TIMESTAMP DEFAULT NOW()
        );
      `);
      // Crear índice para búsqueda rápida
      await client.query(`
        CREATE INDEX idx_processed_emails_message_id ON processed_emails(message_id);
      `);
      logger.info("✅ Tabla 'processed_emails' creada exitosamente.");
    } else {
      logger.debug("✅ La tabla 'processed_emails' ya existe.");
    }

    // Validar y crear la tabla "email_monitor_settings" (config gestionable del monitor)
    const emailMonitorSettingsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'email_monitor_settings'
      );
    `);

    // Semilla común desde variables de entorno.
    // Los remitentes se guardan como DOMINIO (osigu.com) para aceptar también
    // help@osigu.com, noreply@osigu.com, jhon.posada@osigu.com, etc.
    const seedSenders = [
      process.env.EMAIL_FILTER_SENDER || '',
      process.env.EMAIL_FILTER_SENDERS || ''
    ]
      .join(',')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => (s.includes('@') ? s.split('@')[1] : s));
    const uniqueSeedSenders = [...new Set(seedSenders)].join(',') || 'osigu.com';
    const seedRecipients = (process.env.EMAIL_TECH_RECIPIENTS || '')
      .split(',').map((s) => s.trim()).filter(Boolean).join(',');
    const seedInterval = Math.max(30, Math.round((parseInt(process.env.EMAIL_MONITOR_INTERVAL, 10) || 120000) / 1000));
    const seedMailboxes = (process.env.EMAIL_MONITOR_USER && process.env.EMAIL_MONITOR_PASSWORD)
      ? [{
          user: process.env.EMAIL_MONITOR_USER.trim().toLowerCase(),
          password: process.env.EMAIL_MONITOR_PASSWORD.trim(),
          host: process.env.EMAIL_MONITOR_HOST || 'imap.gmail.com',
          port: parseInt(process.env.EMAIL_MONITOR_PORT, 10) || 993,
          label: 'principal'
        }]
      : [];

    if (!emailMonitorSettingsExists.rows[0].exists) {
      logger.info("➕ Creando tabla 'email_monitor_settings'...");
      await client.query(`
        CREATE TABLE email_monitor_settings (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          enabled BOOLEAN DEFAULT true,
          filter_senders TEXT DEFAULT '',
          tech_recipients TEXT DEFAULT '',
          check_interval_seconds INTEGER DEFAULT 120,
          notify_participants BOOLEAN DEFAULT true,
          mailboxes JSONB DEFAULT '[]'::jsonb,
          updated_by INTEGER REFERENCES users(id),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(
        `INSERT INTO email_monitor_settings
           (id, enabled, filter_senders, tech_recipients, check_interval_seconds, notify_participants, mailboxes)
         VALUES (1, true, $1, $2, $3, true, $4::jsonb)`,
        [uniqueSeedSenders, seedRecipients, seedInterval, JSON.stringify(seedMailboxes)]
      );
      logger.info("✅ Tabla 'email_monitor_settings' creada y sembrada desde el entorno.");
    } else {
      logger.debug("✅ La tabla 'email_monitor_settings' ya existe.");

      const mailboxesColExists = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'email_monitor_settings' AND column_name = 'mailboxes'`
      );
      if (mailboxesColExists.rows.length === 0) {
        logger.info("➕ Agregando columna 'mailboxes' a 'email_monitor_settings'...");
        await client.query(`ALTER TABLE email_monitor_settings ADD COLUMN mailboxes JSONB DEFAULT '[]'::jsonb`);
        // Sembrar el buzón del entorno si la columna quedó vacía
        await client.query(
          `UPDATE email_monitor_settings
           SET mailboxes = $1::jsonb
           WHERE id = 1 AND (mailboxes IS NULL OR mailboxes = '[]'::jsonb)`,
          [JSON.stringify(seedMailboxes)]
        );
      }
    }

    logger.info("✅ Validación y creación de tablas completada.");
  } catch (error) {
    logger.error("❌ Error al validar la base de datos:", error);
  } finally {
    client.release();
  }
};

export default checkAndCreateTables;
