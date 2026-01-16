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

/**
 * Remove console statements in production
 * Este archivo se puede usar para eliminar explícitamente console.log en producción
 */

// Sobrescribir console.log, console.warn, console.debug en producción
if (typeof window !== 'undefined' && !(window as any)['isDevMode']) {
  console.log = () => {};
  console.debug = () => {};
  console.warn = () => {};
  // Mantener console.error para errores críticos
}

export {};
