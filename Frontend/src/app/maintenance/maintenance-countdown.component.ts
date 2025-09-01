/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-maintenance-countdown',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="maintenance-countdown-overlay" *ngIf="show">
      <div class="maintenance-countdown-card">
        <mat-card class="countdown-card">
          <mat-card-header>
            <div mat-card-avatar class="maintenance-avatar">
              <mat-icon>construction</mat-icon>
            </div>
            <mat-card-title>Mantenimiento Programado</mat-card-title>
            <mat-card-subtitle>El sistema entrará en mantenimiento</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <div class="countdown-container">
              <div class="countdown-circle">
                <div class="countdown-number">{{ countdown }}</div>
                <div class="countdown-label">segundos</div>
              </div>
              <div class="countdown-message">
                {{ message }}
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions align="end">
            <button mat-button (click)="onDismiss()" class="dismiss-btn">
              <mat-icon>close</mat-icon>
              Minimizar
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .maintenance-countdown-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      animation: slideInRight 0.3s ease-out;
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .maintenance-countdown-card {
      width: 350px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .countdown-card {
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      color: white;
    }

    .countdown-card mat-card-header {
      color: white;
    }

    .maintenance-avatar {
      background-color: rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .countdown-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 0;
    }

    .countdown-circle {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      width: 120px;
      height: 120px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
      }
      70% {
        box-shadow: 0 0 0 20px rgba(255, 255, 255, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
      }
    }

    .countdown-number {
      font-size: 36px;
      font-weight: bold;
      line-height: 1;
    }

    .countdown-label {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 5px;
    }

    .countdown-message {
      text-align: center;
      font-size: 14px;
      opacity: 0.9;
      max-width: 280px;
    }

    .dismiss-btn {
      color: white !important;
    }

    .dismiss-btn mat-icon {
      margin-right: 5px;
    }

    /* Cuando está minimizado */
    .maintenance-countdown-overlay.minimized {
      width: 60px;
      height: 60px;
    }

    .maintenance-countdown-overlay.minimized .maintenance-countdown-card {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      overflow: hidden;
    }

    .maintenance-countdown-overlay.minimized .countdown-card {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .maintenance-countdown-overlay.minimized mat-card-header,
    .maintenance-countdown-overlay.minimized mat-card-content,
    .maintenance-countdown-overlay.minimized mat-card-actions {
      display: none;
    }

    .maintenance-countdown-overlay.minimized::after {
      content: attr(data-countdown);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-weight: bold;
      font-size: 18px;
    }
  `]
})
export class MaintenanceCountdownComponent {
  @Input() show: boolean = false;
  @Input() countdown: number = 0;
  @Input() message: string = '';
  @Output() dismiss = new EventEmitter<void>();

  onDismiss() {
    this.dismiss.emit();
  }
}
