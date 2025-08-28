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
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'presentickets',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkAdmin() {
  try {
    console.log('=== VERIFICANDO USUARIOS ADMIN ===');
    const result = await pool.query('SELECT id, username, email, role, password FROM users WHERE role = $1', ['admin']);
    
    console.log(`Total usuarios admin encontrados: ${result.rows.length}`);
    
    result.rows.forEach(user => {
      console.log('---');
      console.log('ID:', user.id);
      console.log('Username:', user.username);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('Password hash:', user.password ? user.password.substring(0, 30) + '...' : 'NULL');
    });
    
    if (result.rows.length === 0) {
      console.log('❌ No se encontró ningún usuario admin');
      console.log('Verificando si hay usuarios en general...');
      
      const allUsers = await pool.query('SELECT id, username, email, role FROM users LIMIT 5');
      console.log(`Total usuarios en la tabla: ${allUsers.rows.length}`);
      allUsers.rows.forEach(user => {
        console.log(`- ${user.username} (${user.role})`);
      });
    }
  } catch (error) {
    console.error('Error al verificar admin:', error.message);
  } finally {
    await pool.end();
  }
}

checkAdmin().catch(console.error);
