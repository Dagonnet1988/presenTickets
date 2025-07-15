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

    // Validar y crear la tabla "push_subscriptions"
    const pushSubscriptionsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'push_subscriptions'
      );
    `);

    if (!pushSubscriptionsTableExists.rows[0].exists) {
      console.log("➕ Creando tabla 'push_subscriptions'...");
      await client.query(`
        CREATE TABLE push_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          p256dh_key TEXT NOT NULL,
          auth_key TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, endpoint)
        );
      `);
    } else {
      console.log("✅ La tabla 'push_subscriptions' ya existe.");
    }

    console.log("✅ Validación y creación de tablas completada.");
  } catch (error) {
    console.error("❌ Error al validar la base de datos:", error);
  } finally {
    client.release();
  }
};

export default checkAndCreateTables;
