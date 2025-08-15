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

import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  // URLs que NO requieren autenticación
  const publicUrls = [
    '/auth/login',
    '/auth/register',
    '/maintenance/status'
  ];

  // Verificar si la URL es pública
  const isPublicUrl = publicUrls.some(url => req.url.includes(url));
  
  // Solo agregar token si no es una URL pública
  if (!isPublicUrl) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

    if (token) {
      // Verificar si el token existe sin validar la expiración aquí
      // La validación de expiración se hará en el backend
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next(authReq);
    }
  }

  return next(req);
};
