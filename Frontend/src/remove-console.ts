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
