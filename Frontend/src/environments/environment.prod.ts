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
  production: true,
  enableDebugLogs: false, // Desactivar logs de debug en producción
  auth: 'http://192.162.2.5:3000/api/auth',
  user: 'http://192.162.2.5:3000/api/users',
  ticket: 'http://192.162.2.5:3000/api/tickets',
  comment: 'http://192.162.2.5:3000/api/comments',
  maintenance: 'http://192.162.2.5:3000/api/maintenance',
  backendUrl: 'http://192.162.2.5:3000',
  apiUrl: 'http://192.162.2.5:3000',
  appVersion: '1.2'
};

// Eliminar console.log, console.debug, console.warn en producción
if (typeof window !== 'undefined') {
  (window as any)['console']['log'] = () => {};
  (window as any)['console']['debug'] = () => {};
  (window as any)['console']['warn'] = () => {};
  // Mantener console.error para errores críticos
}
