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
      // Si es error 401 (No autorizado) o 403 (Prohibido) y no se está manejando ya
      if ((error.status === 401 || error.status === 403) && !isHandlingSessionExpired) {
        console.log('Token expirado o inválido - Código:', error.status);

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
      }

      return throwError(() => error);
    })
  );
};
