/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../shared/services/auth.service';
import { NotificationService } from '../shared/services/notification.service';
import { MaintenanceSimpleService } from '../shared/services/maintenance-simple.service';

@Component({
  selector: 'app-maintenance-page',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './maintenance-page.component.html',
  styleUrls: ['./maintenance-page.component.css']
})
export class MaintenancePageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  maintenanceMessage: string = '';
  countdown: number | null = null;
  isMaintenanceActive: boolean = false;
  countdownInterval: any;
  isChecking: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private notificationService: NotificationService,
    private maintenanceService: MaintenanceSimpleService
  ) {}

  ngOnInit() {
    // Leer query parameters para mostrar mensaje personalizado
    this.route.queryParams.subscribe(params => {
      if (params['message']) {
        this.maintenanceMessage = params['message'];
        this.isMaintenanceActive = true;
      }
    });

    this.notificationService.maintenance$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        if (state.active) {
          this.isMaintenanceActive = true;
          // Solo hacer logout automático si el usuario estaba logueado
          // Si llegó aquí por un intento de login fallido, no hacer logout
          if (this.authService.isLoggedIn()) {
            this.logout();
          }
        } else if (state.countdown && state.message) {
          this.maintenanceMessage = state.message;
          this.countdown = state.countdown;
          this.isMaintenanceActive = false;
          this.startCountdown();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }

  startCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.countdownInterval = setInterval(() => {
      if (this.countdown && this.countdown > 0) {
        this.countdown--;
      } else {
        clearInterval(this.countdownInterval);
      }
    }, 1000);
  }


  async loadMaintenanceInfo() {
    try {
      const status = await this.maintenanceService.getStatus();
      this.maintenanceMessage = status?.message ?? '';
    } catch (error) {
      console.error('Error cargando información de mantenimiento:', error);
    }
  }

  async checkStatus() {
    this.isChecking = true;
    try {
      const isInMaintenance = await this.maintenanceService.isInMaintenance();
      if (!isInMaintenance) {
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      console.error('Error verificando estado:', error);
    } finally {
      this.isChecking = false;
    }
  }

  private startPeriodicCheck() {
    // Verificar cada 30 segundos si el mantenimiento terminó
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkStatus();
      });
  }
}
// Eliminada función local interval, ahora se importa de rxjs

