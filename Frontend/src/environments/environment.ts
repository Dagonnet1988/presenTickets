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

export const environment = {
  production: false,
  enableDebugLogs: true, // Activar logs de debug en desarrollo
  auth: 'http://localhost:3000/api/auth',
  user: 'http://localhost:3000/api/users',
  ticket: 'http://localhost:3000/api/tickets',
  comment: 'http://localhost:3000/api/comments',
  maintenance: 'http://localhost:3000/api/maintenance',
  backendUrl: 'http://localhost:3000', // Agregado para adjuntos
  apiUrl: 'http://localhost:3000', // Para Socket.IO y APIs generales
  appVersion: '1.1'
};
