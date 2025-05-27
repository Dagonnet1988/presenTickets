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

import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SessionExpiredDialogComponent } from './session-expired-dialog.component';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  // Variable para evitar mostrar múltiples diálogos
  let isDialogOpen = false;

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si es error 401 (No autorizado) o 403 (Prohibido)
      if ((error.status === 401 || error.status === 403) && !isDialogOpen) {
        console.log('Token expirado o inválido - Código:', error.status);

        // Evitar mostrar múltiples diálogos
        isDialogOpen = true;

        // Mostrar diálogo de sesión expirada
        const dialogRef = dialog.open(SessionExpiredDialogComponent, {
          width: '400px',
          disableClose: true,
          panelClass: 'session-expired-dialog'
        });

        // Cuando se cierre el diálogo, redirigir a login
        dialogRef.afterClosed().subscribe(() => {
          // Cerrar sesión y redirigir al login
          authService.logout();
          router.navigate(['/auth'], {
            queryParams: { expired: 'true' }
          });
          isDialogOpen = false;
        });
      }

      return throwError(() => error);
    })
  );
};
