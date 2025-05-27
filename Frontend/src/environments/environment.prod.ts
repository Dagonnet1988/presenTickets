/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
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
  production: true,
  auth: 'http://192.162.2.5:3000/api/auth',
  user: 'http://192.162.2.5:3000/api/users',
  ticket: 'http://192.162.2.5:3000/api/tickets',
  comment: 'http://192.162.2.5:3000/api/comments',
  backendUrl: 'http://192.162.2.5:3000', // <--- Agregado para adjuntos
  appVersion: '1.0.5'
};
