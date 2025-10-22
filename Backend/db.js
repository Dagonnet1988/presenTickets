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
import dotenv from 'dotenv';
import fs from 'fs';

const { Pool } = pkg;

// Cargar variables de entorno según el entorno
// Solo cargar archivos .env si NO estamos en producción usando PM2
const ENV = process.env.NODE_ENV || 'development';

if (!process.env.pm_id) {
  // No estamos usando PM2, cargar desde archivos .env
  
  // Primero intentar cargar .env general (si existe)
  if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
  }

  // Luego cargar el archivo específico del entorno
  const envPath = `.env.${ENV}`;
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  } else if (!fs.existsSync('.env')) {
    console.warn(`⚠️ No se encontró archivo .env ni ${envPath}. Usando variables del sistema.`);
  }
}

// Configuración de la conexión a PostgreSQL
export const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'presentickets',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Probar la conexión
pool.connect((err, client, release) => {
  if (err) {
    console.error(`❌ Error al conectar a la base de datos (${ENV}):`, err.stack);
  } else {
    console.log(`✅ Conexión exitosa a la base de datos (${ENV})`);
    release();
  }
});
