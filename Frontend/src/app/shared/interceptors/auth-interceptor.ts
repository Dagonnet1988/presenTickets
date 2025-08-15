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
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SessionExpiredDialogComponent } from '../components/session-expired-dialog.component';

// Variable global para controlar si ya se está manejando la expiración de sesión
let isHandlingSessionExpired = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Verificar si es error de mantenimiento PRIMERO
      if (error.status === 503 && error.error?.error === 'MAINTENANCE_ACTIVE') {
        console.log('🚧 Sistema en mantenimiento detectado en interceptor');
        
        const maintenanceData = error.error.maintenance;
        
        // Si estamos intentando hacer login durante mantenimiento, SIEMPRE dejar que 
        // el componente de login maneje el error y la redirección
        if (req.url.includes('/auth/login')) {
          console.log('🚧 Error 503 en login - delegando al componente auth');
          return throwError(() => error);
        }
        
        // Solo redirigir automáticamente si NO es una petición de login
        console.log('🚧 Redirigiendo automáticamente por mantenimiento (no-login)');
        router.navigate(['/maintenance'], {
          queryParams: {
            maintenance: JSON.stringify(maintenanceData),
            endTime: maintenanceData?.endTime,
            allowedRoles: JSON.stringify(maintenanceData?.allowedRoles || [])
          }
        });
        return throwError(() => error);
      }

      // Solo procesar errores de token expirado/inválido, no errores de permisos específicos
      const isTokenError = error.status === 401 &&
                          (error.error?.message?.includes('Token') ||
                           error.error?.message?.includes('no proporcionado') ||
                           error.error?.message?.includes('inválido') ||
                           error.error?.message?.includes('expirado'));

      if (isTokenError && !isHandlingSessionExpired && !req.url.includes('/auth/login')) {
        console.log('🚨 Token expirado/inválido detectado:', error.error?.message);

        // Marcar que se está manejando la expiración de sesión
        isHandlingSessionExpired = true;

        // Cerrar sesión inmediatamente
        authService.logout();

        // Mostrar diálogo de sesión expirada
        const dialogRef = dialog.open(SessionExpiredDialogComponent, {
          width: '400px',
          disableClose: true,
          panelClass: 'session-expired-dialog'
        });

        // Cuando se cierre el diálogo, redirigir a login
        dialogRef.afterClosed().subscribe(() => {
          router.navigate(['/auth'], {
            queryParams: { expired: 'true' }
          });
          // Reset el flag después de un pequeño delay
          setTimeout(() => {
            isHandlingSessionExpired = false;
          }, 1000);
        });
      } else if (error.status === 403) {
        // Los errores 403 son de permisos, no de sesión expirada
        console.log('⚠️ Error de permisos (403):', error.error?.message);
      }

      return throwError(() => error);
    })
  );
};
