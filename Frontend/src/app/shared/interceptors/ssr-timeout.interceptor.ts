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

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { timeout, catchError, switchMap } from 'rxjs/operators';

@Injectable()
export class SsrTimeoutInterceptor implements HttpInterceptor {

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Solo aplicar timeouts reducidos en servidor (SSR)
    if (isPlatformServer(this.platformId)) {
      // Timeout especial para rutas de mantenimiento - más tiempo
      const isMaintenanceRoute = req.url.includes('/maintenance');
      const timeoutMs = isMaintenanceRoute ? 8000 : 6000; // 8s para maintenance, 6s para otras
      
      return next.handle(req).pipe(
        timeout(timeoutMs),
        catchError(error => {
          // Si es un error de timeout en SSR, devolver un error más descriptivo
          if (error.name === 'TimeoutError') {
            console.warn(`⏱️ SSR Timeout (${timeoutMs}ms) para ${req.url} - continuando sin datos`);
            
            // Para rutas de mantenimiento, devolver estado por defecto
            if (isMaintenanceRoute) {
              return throwError(() => ({
                name: 'TimeoutError',
                message: 'SSR_TIMEOUT',
                maintenanceDefault: true
              }));
            }
            
            // En lugar de fallar, devolver un error que se puede manejar
            return throwError(() => new Error('SSR_TIMEOUT'));
          }
          return throwError(() => error);
        })
      );
    }

    // Para el browser, usar el comportamiento normal sin timeout
    return next.handle(req);
  }
}
