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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from './shared/services/auth.service';
import { NotificationService } from './shared/services/notification.service';
import { MaintenanceCountdownComponent } from './maintenance/maintenance-countdown.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    MaintenanceCountdownComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Frontend';
  private destroy$ = new Subject<void>();

  // Estado del countdown flotante
  showCountdown = false;
  countdownSeconds = 0;
  countdownMessage = '';
  private countdownInterval?: any;

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit() {
    // Escuchar eventos de mantenimiento
    this.notificationService.maintenance$
      .pipe(takeUntil(this.destroy$))
      .subscribe((maintenanceState) => {
        const currentRoute = this.router.url;
        const userRole = this.authService.getUserRole();

        // Si el usuario es admin, no mostrar countdown ni redirigir
        if (userRole === 'admin') {
          this.hideCountdown();
          return;
        }

        // Si hay countdown activo (mantenimiento va a empezar)
        if (maintenanceState.countdown && maintenanceState.countdown > 0 && !maintenanceState.active) {
          this.showMaintenanceCountdown(maintenanceState.countdown, maintenanceState.message || 'El sistema entrará en mantenimiento.');
        }
        // Si el mantenimiento está activo (countdown terminó)
        else if (maintenanceState.active) {
          this.hideCountdown();
          if (!currentRoute.includes('/maintenance')) {
            this.router.navigate(['/maintenance']);
          }
        }
        // Si el mantenimiento terminó
        else if (!maintenanceState.active && !maintenanceState.countdown) {
          this.hideCountdown();
          if (currentRoute.includes('/maintenance')) {
            this.router.navigate(['/dashboard']);
          }
        }
      });
  }

  private showMaintenanceCountdown(seconds: number, message: string) {
    // Limpiar countdown anterior si existe
    this.hideCountdown();

    this.countdownSeconds = seconds;
    this.countdownMessage = message;
    this.showCountdown = true;

    // Iniciar countdown local
    this.countdownInterval = setInterval(() => {
      this.countdownSeconds--;

      if (this.countdownSeconds <= 0) {
        this.hideCountdown();
      }
    }, 1000);
  }

  private hideCountdown() {
    this.showCountdown = false;
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }
  }

  onCountdownDismiss() {
    // Minimizar el countdown pero mantenerlo funcionando
    this.showCountdown = false;
  }

  ngOnDestroy() {
    this.hideCountdown();
    this.destroy$.next();
    this.destroy$.complete();
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }
}
