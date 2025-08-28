/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Servicio para gestión de configuración de dashboard
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardConfig {
  schedule: {
    work_hours_start: {
      value: string;
      type: string;
      description: string;
      updated_at: string;
    };
    work_hours_end: {
      value: string;
      type: string;
      description: string;
      updated_at: string;
    };
    work_hours_friday_end: {
      value: string;
      type: string;
      description: string;
      updated_at: string;
    };
    lunch_break_start: {
      value: string;
      type: string;
      description: string;
      updated_at: string;
    };
    lunch_break_end: {
      value: string;
      type: string;
      description: string;
      updated_at: string;
    };
  };
  targets: {
    target_response_time: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
    target_resolution_time: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
  };
  sla: {
    sla_critical: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
    sla_high: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
    sla_medium: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
    sla_low: {
      value: number;
      type: string;
      description: string;
      updated_at: string;
    };
  };
  workflow: {
    active_work_states: {
      value: string[];
      type: string;
      description: string;
      updated_at: string;
    };
    paused_states: {
      value: string[];
      type: string;
      description: string;
      updated_at: string;
    };
  };
}

export interface DashboardTargets {
  target_response_time: number;
  target_resolution_time: number;
  sla_critical: number;
  sla_high: number;
  sla_medium: number;
  sla_low: number;
  active_work_states: string[];
  paused_states: string[];
  work_hours_start: string;
  work_hours_end: string;
  work_hours_friday_end: string;
  lunch_break_start: string;
  lunch_break_end: string;
}

export interface UpdateConfigRequest {
  config: { [key: string]: any };
}

export interface UpdateConfigResponse {
  success: boolean;
  message: string;
  updated_count: number;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardConfigService {
  private apiUrl = `${environment.backendUrl}/api/dashboard-config`;

  // Subject para notificar cambios de configuración
  private configChangedSubject = new BehaviorSubject<boolean>(false);
  public configChanged$ = this.configChangedSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Obtener configuración completa del dashboard
   */
  getConfiguration(): Observable<DashboardConfig> {
    return this.http.get<DashboardConfig>(this.apiUrl);
  }

  /**
   * Obtener solo las metas/targets para cálculos
   */
  getTargets(): Observable<DashboardTargets> {
    return this.http.get<DashboardTargets>(`${this.apiUrl}/targets`);
  }

  /**
   * Actualizar configuración (Solo Admin)
   */
  updateConfiguration(config: { [key: string]: any }): Observable<UpdateConfigResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body: UpdateConfigRequest = { config };

    return this.http.put<UpdateConfigResponse>(this.apiUrl, body, { headers }).pipe(
      // Notificar cambio de configuración
      tap(() => this.configChangedSubject.next(true))
    );
  }

  /**
   * Restablecer configuración a valores por defecto (Solo Admin)
   */
  resetToDefaults(): Observable<UpdateConfigResponse> {
    return this.http.post<UpdateConfigResponse>(`${this.apiUrl}/reset`, {}).pipe(
      // Notificar cambio de configuración
      tap(() => this.configChangedSubject.next(true))
    );
  }

  /**
   * Convertir configuración completa a formato plano para edición
   */
  flattenConfig(config: DashboardConfig): { [key: string]: any } {
    const flattened: { [key: string]: any } = {};

    // Procesar cada categoría
    Object.keys(config).forEach(category => {
      const categoryData = config[category as keyof DashboardConfig];
      if (categoryData && typeof categoryData === 'object') {
        Object.keys(categoryData).forEach(key => {
          const item = (categoryData as any)[key];
          if (item && typeof item === 'object' && 'value' in item) {
            flattened[key] = item.value;
          }
        });
      }
    });

    return flattened;
  }

  /**
   * Formatear tiempo en minutos a formato legible
   */
  formatMinutes(minutes: number): string {
    if (minutes === 0) return '0 min';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  }

  /**
   * Validar horario en formato HH:MM
   */
  isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Validar que un valor numérico esté en rango válido
   */
  isValidNumber(value: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): boolean {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  }

  /**
   * Obtener configuración por defecto para casos de error
   */
  getDefaultConfig(): DashboardTargets {
    return {
      work_hours_start: '07:00',
      work_hours_end: '17:30',
      work_hours_friday_end: '16:30',
      lunch_break_start: '12:00',
      lunch_break_end: '13:30',
      target_response_time: 240,
      target_resolution_time: 1440,
      sla_critical: 60,
      sla_high: 240,
      sla_medium: 480,
      sla_low: 1440,
      active_work_states: ['En revisión', 'En gestión', 'Investigando', 'Resolviendo'],
      paused_states: ['Escalado a externo', 'Esperando respuesta del usuario']
    };
  }
}

// Importar tap para el pipe
import { tap } from 'rxjs/operators';
