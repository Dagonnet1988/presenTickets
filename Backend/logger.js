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

// Logger simple por nivel, controlado con la variable de entorno LOG_LEVEL.
// Niveles: 'error' < 'warn' < 'info' < 'debug'.
// En producción (LOG_LEVEL=info) los logs 'debug' no se imprimen.
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

export const logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => currentLogLevel >= LOG_LEVELS.warn && console.warn(...args),
  info: (...args) => currentLogLevel >= LOG_LEVELS.info && console.log(...args),
  debug: (...args) => currentLogLevel >= LOG_LEVELS.debug && console.log(...args),
};

export default logger;
