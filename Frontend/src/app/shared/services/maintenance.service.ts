/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Servicio de Mantenimiento - Frontend Angular
 * Gestiona la comunicación con la API de mantenimiento del backend
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface MaintenanceStatus {
  isActive: boolean;
  isScheduled: boolean;
  status: 'active' | 'scheduled' | 'inactive';
  session: MaintenanceSession | null;
  message: string;
  allowedRoles: string[];
  endTime: string | null;
}

export interface MaintenanceSession {
  id: number;
  title: string;
  description: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  allowedRoles: string[];
  maintenanceMessage: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceRequest {
  title: string;
  description: string;
  scheduledStart: string;
  scheduledEnd: string;
  allowedRoles?: string[];
  maintenanceMessage?: string;
}

export interface MaintenanceHistory {
  sessions: MaintenanceSession[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  private apiUrl = environment.maintenance;

  // Estado reactivo del mantenimiento
  private maintenanceStatusSubject = new BehaviorSubject<MaintenanceStatus | null>(null);
  public maintenanceStatus$ = this.maintenanceStatusSubject.asObservable();

  constructor(private http: HttpClient) {
    // Cargar estado inicial
    this.loadMaintenanceStatus();
  }

  /**
   * Obtener headers con autenticación
   */
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Cargar estado actual del mantenimiento
   */
  loadMaintenanceStatus(): void {
    this.getMaintenanceStatus().subscribe({
      next: (status) => this.maintenanceStatusSubject.next(status),
      error: (error) => console.error('Error cargando estado de mantenimiento:', error)
    });
  }

  /**
   * Obtener estado actual del mantenimiento (público)
   */
  getMaintenanceStatus(): Observable<MaintenanceStatus> {
    return this.http.get<MaintenanceStatus>(`${this.apiUrl}/status`);
  }

  /**
   * Obtener mantenimientos programados
   */
  getScheduledMaintenances(params?: {
    status?: string;
    limit?: number;
    offset?: number;
    includeCompleted?: boolean;
  }): Observable<MaintenanceHistory> {
    const headers = this.getAuthHeaders();
    const queryParams = new URLSearchParams();

    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.includeCompleted) queryParams.append('includeCompleted', params.includeCompleted.toString());

    const url = `${this.apiUrl}/schedules${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.http.get<MaintenanceHistory>(url, { headers });
  }

  /**
   * Programar un nuevo mantenimiento
   */
  scheduleMaintenance(data: CreateMaintenanceRequest): Observable<{ success: boolean; sessionId: number; message: string }> {
    const headers = this.getAuthHeaders();
    return this.http.post<{ success: boolean; sessionId: number; message: string }>(
      `${this.apiUrl}/schedule`,
      data,
      { headers }
    ).pipe(
      tap(() => this.loadMaintenanceStatus()) // Recargar estado después de programar
    );
  }

  /**
   * Iniciar mantenimiento inmediatamente
   */
  startMaintenance(data: {
    title: string;
    description: string;
    allowedRoles?: string[];
    maintenanceMessage?: string;
    estimatedDuration?: number;
  }): Observable<{ success: boolean; sessionId: number; message: string }> {
    const headers = this.getAuthHeaders();
    return this.http.post<{ success: boolean; sessionId: number; message: string }>(
      `${this.apiUrl}/start`,
      data,
      { headers }
    ).pipe(
      tap(() => this.loadMaintenanceStatus()) // Recargar estado después de iniciar
    );
  }

  /**
   * Activar un mantenimiento programado
   */
  activateScheduledMaintenance(sessionId: number): Observable<{ success: boolean; message: string }> {
    const headers = this.getAuthHeaders();
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/activate/${sessionId}`,
      {},
      { headers }
    ).pipe(
      tap(() => this.loadMaintenanceStatus()) // Recargar estado después de activar
    );
  }

  /**
   * Finalizar mantenimiento activo
   */
  endMaintenance(sessionId: number, endMessage?: string): Observable<{ success: boolean; message: string }> {
    const headers = this.getAuthHeaders();
    const body = endMessage ? { endMessage } : {};

    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/end/${sessionId}`,
      body,
      { headers }
    ).pipe(
      tap(() => this.loadMaintenanceStatus()) // Recargar estado después de finalizar
    );
  }

  /**
   * Cancelar un mantenimiento programado
   */
  cancelScheduledMaintenance(sessionId: number, reason?: string): Observable<{ success: boolean; message: string }> {
    const headers = this.getAuthHeaders();
    const body = reason ? { reason } : {};

    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/cancel/${sessionId}`,
      body,
      { headers }
    ).pipe(
      tap(() => this.loadMaintenanceStatus()) // Recargar estado después de cancelar
    );
  }

  /**
   * Obtener historial de mantenimientos
   */
  getMaintenanceHistory(params?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Observable<MaintenanceHistory> {
    const headers = this.getAuthHeaders();
    const queryParams = new URLSearchParams();

    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);

    const url = `${this.apiUrl}/history${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.http.get<MaintenanceHistory>(url, { headers });
  }

  /**
   * Validar consistencia del sistema
   */
  validateConsistency(): Observable<{
    consistent: boolean;
    issues: string[];
    fixes: string[];
    timestamp: string;
  }> {
    const headers = this.getAuthHeaders();
    return this.http.get<{
      consistent: boolean;
      issues: string[];
      fixes: string[];
      timestamp: string;
    }>(`${this.apiUrl}/validate-consistency`, { headers });
  }

  /**
   * Obtener estadísticas del mantenimiento
   */
  getMaintenanceStats(): Observable<{
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    averageDuration: number;
    uptime: number;
    lastMaintenance: string | null;
  }> {
    const headers = this.getAuthHeaders();
    return this.http.get<{
      totalSessions: number;
      completedSessions: number;
      cancelledSessions: number;
      averageDuration: number;
      uptime: number;
      lastMaintenance: string | null;
    }>(`${this.apiUrl}/stats`, { headers });
  }

  /**
   * Verificar si el usuario actual está en modo mantenimiento
   */
  isCurrentUserAllowedDuringMaintenance(): boolean {
    const currentStatus = this.maintenanceStatusSubject.value;
    if (!currentStatus || !currentStatus.isActive) {
      return true; // Si no hay mantenimiento activo, permitir acceso
    }

    const userRole = localStorage.getItem('userRole');
    return currentStatus.allowedRoles.includes(userRole || '');
  }

  /**
   * Obtener el estado actual del mantenimiento (síncrono)
   */
  getCurrentMaintenanceStatus(): MaintenanceStatus | null {
    return this.maintenanceStatusSubject.value;
  }
}
