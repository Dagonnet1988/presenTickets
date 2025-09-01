/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../shared/services/auth.service';
import { MaintenanceSimpleService } from '../shared/services/maintenance-simple.service';
import { NotificationService } from '../shared/services/notification.service';

@Component({
  selector: 'app-maintenance-simple',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  templateUrl: './maintenance-simple.component.html',
  styleUrls: ['./maintenance-simple.component.css']
})
export class MaintenanceSimpleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  maintenanceStatus: any = null;
  newMessage: string = '';
  countdownSeconds: number = 30;

  constructor(
    private maintenanceService: MaintenanceSimpleService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadMaintenanceStatus();

    // Suscribirse a eventos de mantenimiento en tiempo real
    this.notificationService.maintenance$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        if (state.active) {
          // Mantenimiento activo
          this.maintenanceStatus = {
            ...this.maintenanceStatus,
            is_active: true
          };
        } else if (state.countdown && state.message) {
          // Countdown iniciado
          this.maintenanceStatus = {
            ...this.maintenanceStatus,
            is_active: false,
            message: state.message,
            countdown_seconds: state.countdown
          };
        } else if (state.active === false && !state.countdown) {
          // Mantenimiento terminado
          this.maintenanceStatus = {
            ...this.maintenanceStatus,
            is_active: false,
            countdown_seconds: 0
          };
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadMaintenanceStatus() {
    try {
      this.maintenanceStatus = await this.maintenanceService.getStatus();
    } catch (error) {
      console.error('Error cargando estado de mantenimiento:', error);
      this.snackBar.open('Error al cargar estado de mantenimiento', 'Cerrar', { duration: 3000 });
    }
  }

  async startMaintenance() {
    if (!this.newMessage || !this.countdownSeconds) {
      this.snackBar.open('Complete todos los campos', 'Cerrar', { duration: 3000 });
      return;
    }

    if (this.countdownSeconds < 5) {
      this.snackBar.open('El tiempo mínimo es 5 segundos', 'Cerrar', { duration: 3000 });
      return;
    }

    try {
      await this.maintenanceService.startMaintenance(this.newMessage, this.countdownSeconds);
      this.snackBar.open('Mantenimiento iniciado correctamente', 'Cerrar', { duration: 3000 });
      this.loadMaintenanceStatus();

      // Limpiar formulario
      this.newMessage = '';
      this.countdownSeconds = 30;
    } catch (error) {
      console.error('Error iniciando mantenimiento:', error);
      this.snackBar.open('Error al iniciar mantenimiento', 'Cerrar', { duration: 3000 });
    }
  }

  async stopMaintenance() {
    try {
      await this.maintenanceService.stopMaintenance();
      this.snackBar.open('Mantenimiento terminado correctamente', 'Cerrar', { duration: 3000 });
      this.loadMaintenanceStatus();
    } catch (error) {
      console.error('Error terminando mantenimiento:', error);
      this.snackBar.open('Error al terminar mantenimiento', 'Cerrar', { duration: 3000 });
    }
  }

  // Método para refrescar manualmente el estado
  refreshStatus() {
    this.loadMaintenanceStatus();
  }
}
