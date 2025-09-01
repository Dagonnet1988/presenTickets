/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MaintenanceStatus {
  id: number;
  is_active: boolean;
  message: string;
  countdown_seconds: number;
  started_by?: number;
  started_at?: string;
  ended_at?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MaintenanceSimpleService {
  private apiUrl = `${environment.apiUrl}/api/maintenance`;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  async getStatus(): Promise<MaintenanceStatus> {
    return firstValueFrom(this.http.get<MaintenanceStatus>(`${this.apiUrl}/status`, {
      headers: this.getAuthHeaders()
    }));
  }

  async startMaintenance(message: string, countdownSeconds: number): Promise<any> {
    return firstValueFrom(this.http.post(`${this.apiUrl}/start`, {
      message,
      countdownSeconds
    }, {
      headers: this.getAuthHeaders()
    }));
  }

  async stopMaintenance(): Promise<any> {
    return firstValueFrom(this.http.post(`${this.apiUrl}/stop`, {}, {
      headers: this.getAuthHeaders()
    }));
  }

  async isInMaintenance(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status.is_active;
    } catch (error) {
      console.error('Error verificando estado de mantenimiento:', error);
      return false;
    }
  }
}
