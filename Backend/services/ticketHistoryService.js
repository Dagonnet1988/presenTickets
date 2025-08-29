/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Servicio para gestión del historial de cambios de tickets
 */

import { pool } from '../server.js';

/**
 * Registrar un cambio en el historial del ticket
 */
async function logTicketChange(ticketId, userId, changeType, oldValue, newValue, description) {
  try {
    const query = `
      INSERT INTO ticket_history (ticket_id, user_id, change_type, old_value, new_value, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    const result = await pool.query(query, [
      ticketId, 
      userId, 
      changeType, 
      oldValue, 
      newValue, 
      description
    ]);
    
    // También actualizar updated_at del ticket
    await pool.query(
      'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [ticketId]
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error logging ticket change:', error);
    throw error;
  }
}

/**
 * Obtener historial completo de un ticket
 */
async function getTicketHistory(ticketId) {
  try {
    const query = `
      SELECT 
        th.*,
        u.firstname || ' ' || u.lastname as user_name,
        u.role as user_role
      FROM ticket_history th
      LEFT JOIN users u ON th.user_id = u.id
      WHERE th.ticket_id = $1
      ORDER BY th.created_at ASC
    `;
    
    const result = await pool.query(query, [ticketId]);
    return result.rows;
  } catch (error) {
    console.error('Error getting ticket history:', error);
    throw error;
  }
}

/**
 * Calcular métricas de tiempo mejoradas usando historial
 */
async function calculateTimingsFromHistory(ticketId) {
  try {
    const history = await getTicketHistory(ticketId);
    
    // Obtener datos básicos del ticket
    const ticketQuery = `
      SELECT created_at, closed_at, status 
      FROM tickets 
      WHERE id = $1
    `;
    const ticketResult = await pool.query(ticketQuery, [ticketId]);
    
    if (ticketResult.rows.length === 0) {
      throw new Error('Ticket no encontrado');
    }
    
    const ticket = ticketResult.rows[0];
    const createdAt = new Date(ticket.created_at);
    const closedAt = ticket.closed_at ? new Date(ticket.closed_at) : new Date();
    
    // Buscar primera respuesta del técnico
    let firstResponseTime = null;
    const firstTechResponse = history.find(h => 
      h.change_type === 'first_response' || 
      (h.change_type === 'comment_added' && h.user_role === 'tech')
    );
    
    if (firstTechResponse) {
      const responseDate = new Date(firstTechResponse.created_at);
      // IMPORTANTE: Calcular tiempo de respuesta solo en horario laboral
      const { calculateWorkingTime } = await import('./timeCalculations.js');
      firstResponseTime = calculateWorkingTime(createdAt, responseDate);
    }
    
    // Calcular tiempo en estados activos vs pausados
    let activeWorkTime = 0;
    let pausedTime = 0;
    let currentState = 'Creado';
    let lastStateChange = createdAt;
    
    // Definir estados - ACTUALIZADO según configuración del sistema
    const activeStates = ['Creado', 'En gestión', 'En revisión', 'Investigando', 'Resolviendo'];
    const pausedStates = [
      'Escalado a externo', 
      'Esperando respuesta del usuario',
      'Escalado a Tier 3 / Gerente de Cuenta',
      'Escalado a Tier 3'
    ];
    
    // Importar función de cálculo de tiempo laboral
    const { calculateWorkingTime } = await import('./timeCalculations.js');
    
    // Procesar cambios de estado
    const statusChanges = history.filter(h => h.change_type === 'status_change');
    
    for (const change of statusChanges) {
      const changeDate = new Date(change.created_at);
      
      // Clasificar período anterior usando tiempo laboral
      if (activeStates.includes(currentState)) {
        // CLAVE: Solo contar tiempo laboral efectivo
        activeWorkTime += calculateWorkingTime(lastStateChange, changeDate);
      } else if (pausedStates.includes(currentState)) {
        // Para estados pausados, contar tiempo total (calendario)
        pausedTime += Math.floor((changeDate - lastStateChange) / (1000 * 60));
      }
      
      currentState = change.new_value;
      lastStateChange = changeDate;
    }
    
    // Procesar período final
    if (activeStates.includes(currentState)) {
      // CLAVE: Solo tiempo laboral para estados activos
      activeWorkTime += calculateWorkingTime(lastStateChange, closedAt);
    } else if (pausedStates.includes(currentState)) {
      // Tiempo total para estados pausados
      pausedTime += Math.floor((closedAt - lastStateChange) / (1000 * 60));
    }
    
    return {
      ticketId,
      firstResponseTime,
      activeWorkTime,
      pausedTime,
      totalTime: Math.floor((closedAt - createdAt) / (1000 * 60)),
      statusChanges: statusChanges.length,
      lastUpdated: ticket.closed_at || new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error calculating timings from history:', error);
    throw error;
  }
}

/**
 * Tipos de cambios predefinidos
 */
const CHANGE_TYPES = {
  STATUS_CHANGE: 'status_change',
  ASSIGNMENT: 'assignment',
  PRIORITY_CHANGE: 'priority_change',
  FIRST_RESPONSE: 'first_response',
  COMMENT_ADDED: 'comment_added',
  TICKET_CREATED: 'ticket_created',
  TICKET_CLOSED: 'ticket_closed'
};

export {
  logTicketChange,
  getTicketHistory,
  calculateTimingsFromHistory,
  CHANGE_TYPES
};
