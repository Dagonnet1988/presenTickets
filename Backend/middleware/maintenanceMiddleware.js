/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import MaintenanceSimpleService from '../services/maintenanceSimpleService.js';

// Middleware simple para verificar mantenimiento
export const checkMaintenance = async (req, res, next) => {
  try {
    // Permitir rutas de mantenimiento y auth siempre
    if (req.path.startsWith('/api/maintenance') || 
        req.path.startsWith('/api/auth') ||
        req.method === 'OPTIONS') {
      return next();
    }
    
    // Verificar si está en mantenimiento
    const isInMaintenance = await MaintenanceSimpleService.isInMaintenance();
    
    if (isInMaintenance) {
      // Solo permitir acceso a admins
      if (!req.user || req.user.role !== 'admin') {
        return res.status(503).json({ 
          error: 'Sistema en mantenimiento',
          maintenance: true,
          message: 'El sistema está temporalmente en mantenimiento. Solo administradores pueden acceder.'
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Error en middleware de mantenimiento:', error);
    // En caso de error, permitir acceso para evitar bloqueo total
    next();
  }
};

/**
 * Middleware crítico de mantenimiento
 * Más estricto - solo permite acceso a administradores durante mantenimiento
 * Usado para rutas críticas como gestión de usuarios, analytics, etc.
 */
export const criticalRouteMaintenanceMiddleware = async (req, res, next) => {
  try {
    // Obtener estado actual del mantenimiento
    const status = await maintenanceService.getCurrentStatus();
    
    // Si no hay mantenimiento activo, continuar normalmente
    if (!status.isActive) {
      return next();
    }

    // Para rutas críticas, solo permitir acceso a administradores
    const userRole = req.user?.role || 'anonymous';
    
    if (userRole === 'admin') {
      console.log(`✅ Acceso crítico permitido durante mantenimiento - Admin: ${req.user?.username}`);
      return next();
    }

    // Bloquear acceso a rutas críticas para todos los demás usuarios
    console.log(`🚫 Acceso crítico bloqueado durante mantenimiento - Rol: ${userRole}`);
    
    return res.status(503).json({
      error: 'CRITICAL_MAINTENANCE_ACTIVE',
      message: 'Ruta crítica no disponible durante mantenimiento. Solo administradores pueden acceder.',
      maintenance: {
        title: status.session?.title,
        description: status.session?.description,
        startTime: status.session?.actualStart || status.session?.scheduledStart,
        endTime: status.endTime,
        requiredRole: 'admin',
        userRole: userRole
      },
      retryAfter: status.endTime ? Math.max(0, Math.floor((new Date(status.endTime) - new Date()) / 1000)) : null
    });

  } catch (error) {
    console.error('❌ Error en middleware crítico de mantenimiento:', error);
    
    // En caso de error, permitir acceso solo a admins (fail-secure para rutas críticas)
    const userRole = req.user?.role || 'anonymous';
    if (userRole === 'admin') {
      console.warn('⚠️ Error en middleware crítico - permitiendo acceso solo a admin');
      next();
    } else {
      console.warn('⚠️ Error en middleware crítico - bloqueando acceso por seguridad');
      res.status(503).json({
        error: 'SYSTEM_ERROR_MAINTENANCE_CHECK',
        message: 'Error verificando estado del sistema. Acceso restringido por seguridad.'
      });
    }
  }
};

/**
 * Middleware de verificación rápida de mantenimiento
 * Versión ligera que solo verifica estado sin detalles
 * Útil para endpoints de alta frecuencia
 */
export const quickMaintenanceCheck = async (req, res, next) => {
  try {
    // Verificación rápida del estado
    const status = await maintenanceService.getCurrentStatus();
    
    if (!status.isActive) {
      return next();
    }

    const userRole = req.user?.role || 'anonymous';
    const allowedRoles = status.allowedRoles || ['admin'];
    
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Respuesta simplificada para verificación rápida
    return res.status(503).json({
      error: 'MAINTENANCE_ACTIVE',
      message: 'Sistema en mantenimiento'
    });

  } catch (error) {
    console.error('❌ Error en verificación rápida de mantenimiento:', error);
    next(); // Fail-open para verificaciones rápidas
  }
};

/**
 * Función auxiliar para verificar permisos de mantenimiento
 * Puede ser usada en otros lugares sin middleware
 */
export const hasMaintenancePermission = async (userRole) => {
  try {
    const status = await maintenanceService.getCurrentStatus();
    
    if (!status.isActive) {
      return true; // Sin mantenimiento, todos tienen acceso
    }

    const allowedRoles = status.allowedRoles || ['admin'];
    return allowedRoles.includes(userRole || 'anonymous');

  } catch (error) {
    console.error('❌ Error verificando permisos de mantenimiento:', error);
    return false; // En caso de error, denegar acceso
  }
};
