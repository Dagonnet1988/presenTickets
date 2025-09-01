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
import { pool } from './server.js';

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
      console.log(`➕ Creando la base de datos '${dbName}'...`);
      await client.query(`CREATE DATABASE ${dbName};`);
      console.log(`✅ Base de datos '${dbName}' creada exitosamente.`);
    } else {
      console.log(`✅ La base de datos '${dbName}' ya existe.`);
    }

    client.release();
  } catch (error) {
    console.error("❌ Error al verificar/crear la base de datos:", error);
  } finally {
    await defaultPool.end();
  }
};

const checkAndCreateTables = async () => {
  await createDatabaseIfNotExists(); // Llamar a la función para crear la base de datos si no existe

  const client = await pool.connect();
  try {
    console.log("🔍 Verificando estructura de la base de datos...");

    // Validar y crear la tabla "users"
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);

    if (!usersTableExists.rows[0].exists) {
      console.log("➕ Creando tabla 'users'...");
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
      console.log("✅ La tabla 'users' ya existe. Verificando columnas...");
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
          console.log(`➕ Agregando columna '${column.name}' a la tabla 'users'`);
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
      console.log("➕ Creando tabla 'tickets'...");
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
      console.log("✅ La tabla 'tickets' ya existe. Verificando columnas...");
      
      // Verificar y agregar columna external_ticket_id si no existe
      const externalTicketIdColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'external_ticket_id'`
      );
      if (externalTicketIdColumn.rows.length === 0) {
        console.log("➕ Agregando columna 'external_ticket_id' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN external_ticket_id VARCHAR(100)`);
      } else {
        console.log("✅ La columna 'external_ticket_id' ya existe en la tabla 'tickets'.");
      }
      
      // Verificar y agregar columna participants si no existe
      const participantsColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'participants'`
      );
      if (participantsColumn.rows.length === 0) {
        console.log("➕ Agregando columna 'participants' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN participants INTEGER[] DEFAULT '{}'`);
        console.log("✅ Columna 'participants' agregada exitosamente.");
      } else {
        console.log("✅ La columna 'participants' ya existe en la tabla 'tickets'.");
      }

      // Verificar y agregar columna updated_at si no existe
      const updatedAtColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'tickets' AND column_name = 'updated_at'`
      );
      if (updatedAtColumn.rows.length === 0) {
        console.log("➕ Agregando columna 'updated_at' a la tabla 'tickets'");
        await client.query(`ALTER TABLE tickets ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        
        // Actualizar registros existentes para que tengan updated_at = created_at
        await client.query(`UPDATE tickets SET updated_at = created_at WHERE updated_at IS NULL`);
        console.log("✅ Columna 'updated_at' agregada y datos existentes actualizados.");
      } else {
        console.log("✅ La columna 'updated_at' ya existe en la tabla 'tickets'.");
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
      console.log("➕ Creando tabla 'comments'...");
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
      console.log("✅ La tabla 'comments' ya existe.");
    }

    // Validar y crear la tabla "attachments"
    const attachmentsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'attachments'
      );
    `);

    if (!attachmentsTableExists.rows[0].exists) {
      console.log("➕ Creando tabla 'attachments'...");
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
      console.log("✅ La tabla 'attachments' ya existe. Verificando columnas...");
      // Verificar y agregar columna comment_id si no existe
      const commentIdColumn = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'attachments' AND column_name = 'comment_id'`
      );
      if (commentIdColumn.rows.length === 0) {
        console.log("➕ Agregando columna 'comment_id' a la tabla 'attachments'");
        await client.query(`ALTER TABLE attachments ADD COLUMN comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE`);
      } else {
          console.log(`✅ La columna 'comment_id' ya existe en la tabla 'attachments'.`);
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
      console.log("➕ Creando tabla 'notifications'...");
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
      console.log("✅ La tabla 'notifications' ya existe. Verificando columnas...");
      // Verificar y agregar columnas si faltan
      const columns = [
        { name: 'type', type: 'VARCHAR(50) NOT NULL' },
        { name: 'message', type: 'TEXT NOT NULL' },
        { name: 'ticket_id', type: 'INTEGER REFERENCES tickets(id) ON DELETE CASCADE' },
        { name: 'is_read', type: 'BOOLEAN DEFAULT false' },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
      ];
      for (const column of columns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'notifications' AND column_name = $1`,
          [column.name]
        );
        if (columnExists.rows.length === 0) {
          console.log(`➕ Agregando columna '${column.name}' a la tabla 'notifications'`);
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
      console.log("➕ Creando tabla 'whatsapp_notifications'...");
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
      console.log("✅ La tabla 'whatsapp_notifications' ya existe.");
      
      // Verificar si existe la columna notification_type, si no existe agregarla
      const notificationTypeColumnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'whatsapp_notifications' 
          AND column_name = 'notification_type'
        );
      `);
      
      if (!notificationTypeColumnExists.rows[0].exists) {
        console.log("➕ Agregando columna 'notification_type' a 'whatsapp_notifications'...");
        await client.query(`
          ALTER TABLE whatsapp_notifications 
          ADD COLUMN notification_type VARCHAR(50) DEFAULT 'unknown';
        `);
        console.log("✅ Columna 'notification_type' agregada exitosamente.");
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
      console.log("➕ Creando tabla 'dashboard_settings'...");
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
      console.log("✅ Tabla 'dashboard_settings' creada exitosamente.");
    } else {
      console.log("✅ La tabla 'dashboard_settings' ya existe.");
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
          console.log(`➕ Agregando columna '${column.name}' a la tabla 'dashboard_settings'`);
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
      console.log("➕ Creando tabla 'user_preferences_settings'...");
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
      console.log("✅ La tabla 'user_preferences_settings' ya existe.");
      
      // Actualizar el valor por defecto de whatsapp_enabled a true
      try {
        await client.query(`
          ALTER TABLE user_preferences_settings 
          ALTER COLUMN whatsapp_enabled SET DEFAULT true
        `);
        console.log("✅ Valor por defecto de 'whatsapp_enabled' actualizado a true.");
      } catch (error) {
        console.log("⚠️ Error actualizando valor por defecto:", error.message);
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
        { name: 'do_not_disturb_until', type: 'TIMESTAMP NULL', description: 'No molestar hasta' }
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
            console.log(`✅ Columna '${column.name}' agregada: ${column.description}`);
          }
        } catch (error) {
          console.log(`⚠️ Error agregando columna '${column.name}':`, error.message);
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
      console.log("➕ Creando tabla 'dashboard_config'...");
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
      
      console.log("✅ Tabla 'dashboard_config' creada con configuraciones por defecto.");
    } else {
      console.log("✅ La tabla 'dashboard_config' ya existe.");
    }

    // Crear tabla ticket_history para seguimiento de cambios
    const ticketHistoryExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ticket_history'
      );
    `);

    if (!ticketHistoryExists.rows[0].exists) {
      console.log("➕ Creando tabla 'ticket_history'...");
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
      
      console.log("✅ Tabla 'ticket_history' creada con índices.");
    } else {
      console.log("✅ La tabla 'ticket_history' ya existe.");
    }

    // Eliminar tabla ticket_participants si existe (ya no se usa)
    const ticketParticipantsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ticket_participants'
      );
    `);

    if (ticketParticipantsTableExists.rows[0].exists) {
      console.log("🗑️ Eliminando tabla 'ticket_participants' (ya no se usa)...");
      await client.query(`DROP TABLE IF EXISTS ticket_participants CASCADE;`);
      console.log("✅ Tabla 'ticket_participants' eliminada exitosamente.");
    }

    // ==========================================
    // 8. TABLA SYSTEM_SETTINGS (Configuración Global)
    // ==========================================
    console.log("🔧 Verificando tabla 'system_settings'...");
    const systemSettingsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'system_settings'
      );
    `);

    if (!systemSettingsTableExists.rows[0].exists) {
      console.log("➕ Creando tabla 'system_settings' (configuración global del sistema)...");
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
      
      console.log("✅ Tabla 'system_settings' creada exitosamente con configuración por defecto.");
    } else {
      console.log("✅ La tabla 'system_settings' ya existe.");
      
      // Verificar y agregar columnas de antibloqueo si no existen
      const antiblockColumns = [
        { name: 'whatsapp_min_delay', type: 'INTEGER DEFAULT 1000' },
        { name: 'whatsapp_max_delay', type: 'INTEGER DEFAULT 3000' },
        { name: 'whatsapp_max_hour', type: 'INTEGER DEFAULT 60' },
        { name: 'whatsapp_max_daily', type: 'INTEGER DEFAULT 200' },
        { name: 'whatsapp_max_burst', type: 'INTEGER DEFAULT 5' }
      ];
      
      for (const column of antiblockColumns) {
        const columnExists = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'system_settings' AND column_name = $1`,
          [column.name]
        );
        
        if (columnExists.rows.length === 0) {
          console.log(`➕ Agregando columna '${column.name}' a 'system_settings'...`);
          await client.query(`ALTER TABLE system_settings ADD COLUMN ${column.name} ${column.type};`);
          console.log(`✅ Columna '${column.name}' agregada exitosamente.`);
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
      console.log("➕ Creando tabla 'maintenance_status' (versión simplificada)...");
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
      console.log("✅ Tabla 'maintenance_status' creada exitosamente (versión simple).");
    } else {
      console.log("✅ La tabla 'maintenance_status' ya existe.");
    }

    console.log("✅ Validación y creación de tablas completada.");
  } catch (error) {
    console.error("❌ Error al validar la base de datos:", error);
  } finally {
    client.release();
  }
};

export default checkAndCreateTables;
