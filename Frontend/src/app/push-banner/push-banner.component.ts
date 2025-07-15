/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Banner de Notificaciones Push
 * Banner discreto para sugerir activación de notificaciones
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 *
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { PushNotificationService } from '../shared/services/push-notification.service';

@Component({
  selector: 'app-push-banner',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  template: `
    <div
      class="push-banner"
      *ngIf="shouldShowBanner"
      [@slideDown]
    >
      <div class="banner-content">
        <mat-icon class="banner-icon">notifications_none</mat-icon>
        <div class="banner-text">
          <span class="banner-title">¿Quieres recibir notificaciones?</span>
          <span class="banner-subtitle">Mantente al día con nuevos tickets y comentarios</span>
        </div>
        <div class="banner-actions">
          <button
            mat-button
            (click)="activateNotifications()"
            class="activate-btn"
          >
            Activar
          </button>
          <button
            mat-icon-button
            (click)="dismissBanner()"
            class="dismiss-btn"
            aria-label="Cerrar"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .push-banner {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: relative;
      z-index: 1000;
    }

    .banner-content {
      display: flex;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
      gap: 16px;
    }

    .banner-icon {
      font-size: 24px;
      opacity: 0.9;
    }

    .banner-text {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .banner-title {
      font-weight: 500;
      font-size: 14px;
    }

    .banner-subtitle {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 2px;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .activate-btn {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 20px;
      padding: 0 16px;
      font-size: 12px;
      height: 32px;
      transition: all 0.3s ease;
    }

    .activate-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: translateY(-1px);
    }

    .dismiss-btn {
      color: rgba(255,255,255,0.7);
      width: 32px;
      height: 32px;
    }

    .dismiss-btn:hover {
      color: white;
      background: rgba(255,255,255,0.1);
    }

    @media (max-width: 768px) {
      .banner-content {
        gap: 12px;
      }

      .banner-text {
        font-size: 13px;
      }

      .banner-subtitle {
        display: none;
      }
    }
  `],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 }),
        animate('300ms ease-in', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-out', style({ transform: 'translateY(-100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class PushBannerComponent implements OnInit {
  shouldShowBanner = false;
  private bannerDismissed = false;

  constructor(
    private pushNotificationService: PushNotificationService,
    private router: Router
  ) {}

  ngOnInit() {
    // Verificar si mostrar el banner después de un momento
    setTimeout(() => {
      this.checkShouldShowBanner();
    }, 2000);
  }

  private checkShouldShowBanner(): void {
    // Verificar si ya fue descartado en esta sesión
    if (this.bannerDismissed) return;

    // Verificar si ya fue descartado permanentemente
    const permanentlyDismissed = localStorage.getItem('pushBannerDismissed');
    if (permanentlyDismissed) return;

    // Verificar si las notificaciones ya están habilitadas
    this.pushNotificationService.isEnabled$.subscribe(isEnabled => {
      if (!isEnabled && this.pushNotificationService.isNotificationSupported()) {
        this.shouldShowBanner = true;
      }
    });
  }

  async activateNotifications(): Promise<void> {
    try {
      const success = await this.pushNotificationService.requestPermissionAndSubscribe();

      if (success) {
        this.shouldShowBanner = false;
        console.log('✅ Notificaciones push activadas desde el banner');
      } else {
        // Si falla, redirigir a la página de configuración
        this.router.navigate(['/push-settings']);
      }
    } catch (error) {
      console.log('Error activando notificaciones:', error);
      // Redirigir a configuración manual
      this.router.navigate(['/push-settings']);
    }
  }

  dismissBanner(): void {
    this.shouldShowBanner = false;
    this.bannerDismissed = true;

    // Preguntar si quiere ocultarlo permanentemente
    setTimeout(() => {
      const hidePermanently = confirm('¿Quieres ocultar este recordatorio permanentemente?');
      if (hidePermanently) {
        localStorage.setItem('pushBannerDismissed', 'true');
      }
    }, 300);
  }
}
