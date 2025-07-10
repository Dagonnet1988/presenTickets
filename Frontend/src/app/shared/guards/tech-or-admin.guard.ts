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

import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class TechOrAdminGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  canActivate(): boolean {
    const userRole = this.authService.getUserRole();

    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/auth']);
      return false;
    }

    if (userRole === 'admin' || userRole === 'tech') {
      return true;
    } else {
      this.snackBar.open('Acceso denegado. Se requieren permisos de técnico o administrador.', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
      this.router.navigate(['/']);
      return false;
    }
  }
}
