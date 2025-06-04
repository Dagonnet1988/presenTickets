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
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardMetrics {
  totalTickets: number;
  closedTickets: number;
  openTickets: number;
  avgResolutionTime: string;
  avgResponseTime: string;
  slaComplianceRate: number;
  rawMetrics: any[];
}

export interface TicketByStatus {
  status: string;
  count: number;
}

export interface TimeTrend {
  period: string;
  tickets_created: number;
  tickets_closed: number;
}

export interface TechPerformance {
  id: number;
  username: string;
  name: string;
  total_tickets: number;
  closed_tickets: number;
  closure_rate: number;
  avg_resolution_hours: number;
}

export interface TicketByPriority {
  priority: string;
  count: number;
  closed_count: number;
}

export interface TicketByArea {
  area: string;
  category: string;
  count: number;
}

export interface RecentActivity {
  activity_type: string;
  ticket_id: number;
  title: string;
  activity_date: string;
  user_name: string;
  status: string;
  priority: string;
}

export interface TicketTiming {
  ticketId: number;
  totalTime: number;
  activeWorkTime: number;
  responseTime: number;
  resolutionTime: number | null;
  customerWaitTime: number;
  externalVendorTime: number;
  slaCompliance: boolean | null;
  totalTimeFormatted: string;
  activeWorkTimeFormatted: string;
  responseTimeFormatted: string;
  resolutionTimeFormatted: string | null;
  workingHoursOnly: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private baseUrl = environment.auth.replace('/auth', '/analytics');

  constructor(private http: HttpClient) {}

  /**
   * Obtiene métricas generales del dashboard
   */
  getDashboardMetrics(startDate?: string, endDate?: string): Observable<DashboardMetrics> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<DashboardMetrics>(`${this.baseUrl}/dashboard`, { params });
  }

  /**
   * Obtiene tickets agrupados por estado
   */
  getTicketsByStatus(startDate?: string, endDate?: string): Observable<TicketByStatus[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByStatus[]>(`${this.baseUrl}/tickets-by-status`, { params });
  }

  /**
   * Obtiene tendencias temporales
   */
  getTimeTrends(period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily', startDate?: string, endDate?: string): Observable<TimeTrend[]> {
    let params = new HttpParams().set('period', period);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TimeTrend[]>(`${this.baseUrl}/time-trends`, { params });
  }

  /**
   * Obtiene performance por técnico
   */
  getTechPerformance(startDate?: string, endDate?: string): Observable<TechPerformance[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TechPerformance[]>(`${this.baseUrl}/tech-performance`, { params });
  }

  /**
   * Obtiene métricas de tiempo para un ticket específico
   */
  getTicketTiming(ticketId: number): Observable<TicketTiming> {
    return this.http.get<TicketTiming>(`${this.baseUrl}/ticket-timing/${ticketId}`);
  }

  /**
   * Obtiene tickets agrupados por prioridad
   */
  getTicketsByPriority(startDate?: string, endDate?: string): Observable<TicketByPriority[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByPriority[]>(`${this.baseUrl}/tickets-by-priority`, { params });
  }

  /**
   * Obtiene tickets agrupados por área
   */
  getTicketsByArea(startDate?: string, endDate?: string): Observable<TicketByArea[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByArea[]>(`${this.baseUrl}/tickets-by-area`, { params });
  }

  /**
   * Obtiene actividad reciente
   */
  getRecentActivity(limit: number = 10): Observable<RecentActivity[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<RecentActivity[]>(`${this.baseUrl}/recent-activity`, { params });
  }
}
