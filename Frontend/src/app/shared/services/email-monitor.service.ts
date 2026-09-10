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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmailMonitorSettings {
  enabled: boolean;
  filterSenders: string[];
  techRecipients: string[];
  checkIntervalSeconds: number;
  notifyParticipants: boolean;
  updatedAt?: string | null;
}

export interface EmailMonitorStatus {
  isRunning: boolean;
  isConnected: boolean;
  isConfigured: boolean;
  enabled: boolean;
  notifyParticipants: boolean;
  lastCheckTime: string | null;
  errorCount: number;
  processedEmailsCount: number;
  config: {
    user: string;
    filterSenders: string[];
    techRecipients: string[];
    checkIntervalSeconds: number;
  };
}

export interface ProcessedEmail {
  id: number;
  external_ticket_id: string | null;
  subject: string;
  from_address: string;
  processed_at: string;
  ticket_id: number | null;
}

@Injectable({ providedIn: 'root' })
export class EmailMonitorService {
  private base = `${environment.backendUrl}/api/email-monitor`;

  constructor(private http: HttpClient) {}

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  }

  getStatus(): Observable<EmailMonitorStatus> {
    return this.http.get<EmailMonitorStatus>(`${this.base}/status`, { headers: this.headers() });
  }

  getSettings(): Observable<EmailMonitorSettings> {
    return this.http.get<EmailMonitorSettings>(`${this.base}/settings`, { headers: this.headers() });
  }

  saveSettings(settings: EmailMonitorSettings): Observable<{ success: boolean; message: string; status: EmailMonitorStatus }> {
    return this.http.put<{ success: boolean; message: string; status: EmailMonitorStatus }>(
      `${this.base}/settings`, settings, { headers: this.headers() }
    );
  }

  checkNow(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.base}/check`, {}, { headers: this.headers() });
  }

  getHistory(limit = 50): Observable<ProcessedEmail[]> {
    return this.http.get<ProcessedEmail[]>(`${this.base}/history?limit=${limit}`, { headers: this.headers() });
  }
}
