/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { pool } from '../db.js';

class MaintenanceSimpleService {
  
  // Obtener estado actual del mantenimiento
  static async getStatus() {
    try {
      const result = await pool.query(`
        SELECT * FROM maintenance_status 
        ORDER BY id DESC 
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        // Si no existe, crear registro inicial
        await pool.query(`
          INSERT INTO maintenance_status (is_active) VALUES (false)
        `);
        return { is_active: false, message: 'Sistema en mantenimiento. Disculpe las molestias.', countdown_seconds: 0 };
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error obteniendo estado de mantenimiento:', error);
      throw error;
    }
  }
  
  // Iniciar countdown de mantenimiento (aún no activo)
  static async startMaintenanceCountdown(message, countdownSeconds, userId) {
    try {
      await pool.query(`
        UPDATE maintenance_status 
        SET 
          is_active = false,
          message = $1,
          countdown_seconds = $2,
          started_by = $3,
          started_at = NOW()
        WHERE id = (SELECT id FROM maintenance_status ORDER BY id DESC LIMIT 1)
      `, [message, countdownSeconds, userId]);
      
      return await this.getStatus();
    } catch (error) {
      console.error('Error iniciando countdown de mantenimiento:', error);
      throw error;
    }
  }

  // Activar mantenimiento (después del countdown)
  static async activateMaintenance() {
    try {
      await pool.query(`
        UPDATE maintenance_status 
        SET 
          is_active = true,
          countdown_seconds = 0
        WHERE id = (SELECT id FROM maintenance_status ORDER BY id DESC LIMIT 1)
      `);
      
      return await this.getStatus();
    } catch (error) {
      console.error('Error activando mantenimiento:', error);
      throw error;
    }
  }
  
  // Terminar mantenimiento
  static async stopMaintenance() {
    try {
      await pool.query(`
        UPDATE maintenance_status 
        SET 
          is_active = false,
          countdown_seconds = 0,
          ended_at = NOW()
        WHERE id = (SELECT id FROM maintenance_status ORDER BY id DESC LIMIT 1)
      `);
      
      return await this.getStatus();
    } catch (error) {
      console.error('Error terminando mantenimiento:', error);
      throw error;
    }
  }
  
  // Verificar si el sistema está en mantenimiento
  static async isInMaintenance() {
    try {
      const status = await this.getStatus();
      return status.is_active;
    } catch (error) {
      console.error('Error verificando estado de mantenimiento:', error);
      return false; // En caso de error, permitir acceso
    }
  }

  // Verificar si estamos en countdown (no bloquea navegación)
  static async isInCountdown() {
    try {
      const status = await this.getStatus();
      return !status.is_active && status.countdown_seconds > 0;
    } catch (error) {
      console.error('Error verificando countdown de mantenimiento:', error);
      return false;
    }
  }
}

export default MaintenanceSimpleService;
