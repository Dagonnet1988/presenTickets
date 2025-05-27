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

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-session-expired-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, RouterModule],
  template: `
    <div class="dialog-header">
      <mat-icon color="warn">access_time</mat-icon>
      <h2 mat-dialog-title>Sesión expirada</h2>
    </div>
    <mat-dialog-content>
      <p>Tu sesión ha expirado por inactividad o tiempo límite.</p>
      <p class="emphasis">Por favor, inicia sesión nuevamente para continuar.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="center">
      <button mat-raised-button mat-dialog-close color="primary" routerLink="/login">
        <mat-icon>login</mat-icon>
        Iniciar sesión
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 0 8px;
      gap: 8px;
      border-bottom: 1px solid #f0f0f0;
    }
    h2 {
      color: #d32f2f;
      margin: 0;
    }
    mat-dialog-content {
      margin: 20px 0;
      text-align: center;
    }
    .emphasis {
      font-weight: 500;
      color: #d32f2f;
      margin-top: 16px;
    }
    mat-dialog-actions {
      border-top: 1px solid #f0f0f0;
      padding-top: 16px;
      margin-bottom: 8px;
    }
  `]
})
export class SessionExpiredDialogComponent {}
