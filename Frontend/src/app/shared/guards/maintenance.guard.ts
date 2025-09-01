/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { MaintenanceSimpleService } from '../services/maintenance-simple.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceGuard implements CanActivate {

  constructor(
    private maintenanceService: MaintenanceSimpleService,
    private authService: AuthService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    try {
      const isInMaintenance = await this.maintenanceService.isInMaintenance();

      if (isInMaintenance) {
        const userRole = this.authService.getUserRole();

        // Solo admins pueden acceder durante mantenimiento
        if (userRole !== 'admin') {
          this.router.navigate(['/maintenance']);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error en MaintenanceGuard:', error);
      // En caso de error, permitir acceso para evitar bloqueo total
      return true;
    }
  }
}
