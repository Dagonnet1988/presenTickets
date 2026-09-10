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

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  EmailMonitorService,
  EmailMonitorSettings,
  EmailMonitorStatus,
  ProcessedEmail
} from '../shared/services/email-monitor.service';

@Component({
  selector: 'app-email-monitor-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  templateUrl: './email-monitor-admin.component.html',
  styleUrls: ['./email-monitor-admin.component.css']
})
export class EmailMonitorAdminComponent implements OnInit {
  loading = { settings: true, saving: false, checking: false, history: false };

  // Editable en el formulario (los correos, uno por línea)
  form = {
    enabled: true,
    sendersText: '',
    recipientsText: '',
    checkIntervalSeconds: 120,
    notifyParticipants: true
  };

  status: EmailMonitorStatus | null = null;
  history: ProcessedEmail[] = [];

  constructor(
    private emailMonitor: EmailMonitorService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loadSettings();
    this.loadStatus();
    this.loadHistory();
  }

  private loadSettings(): void {
    this.loading.settings = true;
    this.emailMonitor.getSettings().subscribe({
      next: (s: EmailMonitorSettings) => {
        this.form = {
          enabled: s.enabled,
          sendersText: (s.filterSenders || []).join('\n'),
          recipientsText: (s.techRecipients || []).join('\n'),
          checkIntervalSeconds: s.checkIntervalSeconds || 120,
          notifyParticipants: s.notifyParticipants
        };
        this.loading.settings = false;
      },
      error: () => {
        this.loading.settings = false;
        this.snackBar.open('No se pudo cargar la configuración del monitor', 'Cerrar', { duration: 4000 });
      }
    });
  }

  private loadStatus(): void {
    this.emailMonitor.getStatus().subscribe({
      next: (st) => (this.status = st),
      error: () => (this.status = null)
    });
  }

  loadHistory(): void {
    this.loading.history = true;
    this.emailMonitor.getHistory(50).subscribe({
      next: (rows) => {
        this.history = rows;
        this.loading.history = false;
      },
      error: () => {
        this.history = [];
        this.loading.history = false;
      }
    });
  }

  private parseLines(text: string): string[] {
    return (text || '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));
  }

  save(): void {
    const filterSenders = this.parseLines(this.form.sendersText);
    const techRecipients = this.parseLines(this.form.recipientsText);

    if (filterSenders.length === 0) {
      this.snackBar.open('Agrega al menos un remitente permitido', 'Cerrar', { duration: 4000 });
      return;
    }
    if (techRecipients.length === 0) {
      this.snackBar.open('Agrega al menos un buzón técnico', 'Cerrar', { duration: 4000 });
      return;
    }

    const interval = Math.min(3600, Math.max(30, Number(this.form.checkIntervalSeconds) || 120));

    this.loading.saving = true;
    this.emailMonitor
      .saveSettings({
        enabled: this.form.enabled,
        filterSenders,
        techRecipients,
        checkIntervalSeconds: interval,
        notifyParticipants: this.form.notifyParticipants
      })
      .subscribe({
        next: (res) => {
          this.loading.saving = false;
          this.status = res.status;
          this.snackBar.open('Configuración guardada y aplicada', 'Cerrar', { duration: 3000 });
          this.loadSettings();
        },
        error: (err) => {
          this.loading.saving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar la configuración', 'Cerrar', { duration: 4000 });
        }
      });
  }

  checkNow(): void {
    this.loading.checking = true;
    this.emailMonitor.checkNow().subscribe({
      next: (res) => {
        this.loading.checking = false;
        this.snackBar.open(res.message || 'Revisión completada', 'Cerrar', { duration: 3000 });
        this.loadStatus();
        this.loadHistory();
      },
      error: (err) => {
        this.loading.checking = false;
        this.snackBar.open(err?.error?.message || 'No se pudo ejecutar la revisión', 'Cerrar', { duration: 4000 });
      }
    });
  }
}
