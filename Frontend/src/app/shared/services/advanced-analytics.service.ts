/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Analytics Avanzados - Métricas predictivas y análisis de tendencias
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

// Interfaces existentes del analytics.service.ts
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

// Nuevas interfaces para analytics avanzados
export interface PredictiveAnalysis {
  expectedTicketsNextWeek: number;
  expectedResolutionTime: number;
  riskFactors: RiskFactor[];
  recommendations: Recommendation[];
}

export interface RiskFactor {
  factor: string;
  risk_level: 'low' | 'medium' | 'high';
  impact: string;
  probability: number;
}

export interface Recommendation {
  type: 'operational' | 'strategic' | 'resource';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  expected_impact: string;
  estimated_effort: string;
}

export interface WorkloadAnalysis {
  team_capacity: number;
  current_workload: number;
  capacity_utilization: number;
  bottlenecks: Bottleneck[];
  optimal_distribution: OptimalDistribution[];
}

export interface Bottleneck {
  area: string;
  severity: 'low' | 'medium' | 'high';
  avg_wait_time: number;
  suggested_actions: string[];
}

export interface OptimalDistribution {
  tech_id: number;
  tech_name: string;
  current_tickets: number;
  recommended_tickets: number;
  adjustment_needed: number;
}

export interface CustomerSatisfactionMetrics {
  average_rating: number;
  response_satisfaction: number;
  resolution_satisfaction: number;
  communication_satisfaction: number;
  satisfaction_trend: SatisfactionTrend[];
}

export interface SatisfactionTrend {
  period: string;
  rating: number;
  responses: number;
}

export interface CostAnalysis {
  total_labor_cost: number;
  cost_per_ticket: number;
  cost_by_priority: CostByPriority[];
  cost_efficiency_trend: CostEfficiencyTrend[];
}

export interface CostByPriority {
  priority: string;
  total_cost: number;
  avg_cost_per_ticket: number;
}

export interface CostEfficiencyTrend {
  period: string;
  cost_per_ticket: number;
  tickets_handled: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdvancedAnalyticsService {
  private baseUrl = environment.auth.replace('/auth', '/analytics');

  constructor(private http: HttpClient) {}

  /**
   * Obtiene métricas generales del dashboard
   */
  getDashboardMetrics(startDate?: string, endDate?: string): Observable<DashboardMetrics> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<DashboardMetrics>(`${this.baseUrl}/dashboard`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching dashboard metrics:', error);
          return of({
            totalTickets: 0,
            closedTickets: 0,
            openTickets: 0,
            avgResolutionTime: 'N/A',
            avgResponseTime: 'N/A',
            slaComplianceRate: 0,
            rawMetrics: []
          });
        })
      );
  }

  /**
   * Obtiene análisis predictivo basado en datos históricos
   */
  getPredictiveAnalysis(startDate?: string, endDate?: string): Observable<PredictiveAnalysis> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<PredictiveAnalysis>(`${this.baseUrl}/predictive-analysis`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching predictive analysis:', error);
          return of({
            expectedTicketsNextWeek: 0,
            expectedResolutionTime: 0,
            riskFactors: [],
            recommendations: []
          });
        })
      );
  }

  /**
   * Obtiene análisis de carga de trabajo y capacidad del equipo
   */
  getWorkloadAnalysis(startDate?: string, endDate?: string): Observable<WorkloadAnalysis> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<WorkloadAnalysis>(`${this.baseUrl}/workload-analysis`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching workload analysis:', error);
          return of({
            team_capacity: 0,
            current_workload: 0,
            capacity_utilization: 0,
            bottlenecks: [],
            optimal_distribution: []
          });
        })
      );
  }

  /**
   * Obtiene métricas de satisfacción del cliente
   */
  getCustomerSatisfactionMetrics(startDate?: string, endDate?: string): Observable<CustomerSatisfactionMetrics> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<CustomerSatisfactionMetrics>(`${this.baseUrl}/customer-satisfaction`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching customer satisfaction metrics:', error);
          return of({
            average_rating: 0,
            response_satisfaction: 0,
            resolution_satisfaction: 0,
            communication_satisfaction: 0,
            satisfaction_trend: []
          });
        })
      );
  }

  /**
   * Obtiene análisis de costos operacionales
   */
  getCostAnalysis(startDate?: string, endDate?: string): Observable<CostAnalysis> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<CostAnalysis>(`${this.baseUrl}/cost-analysis`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching cost analysis:', error);
          return of({
            total_labor_cost: 0,
            cost_per_ticket: 0,
            cost_by_priority: [],
            cost_efficiency_trend: []
          });
        })
      );
  }

  /**
   * Métodos existentes del servicio original
   */
  getTicketsByStatus(startDate?: string, endDate?: string): Observable<TicketByStatus[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByStatus[]>(`${this.baseUrl}/tickets-by-status`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching tickets by status:', error);
          return of([]);
        })
      );
  }

  getTimeTrends(period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily', startDate?: string, endDate?: string): Observable<TimeTrend[]> {
    let params = new HttpParams().set('period', period);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TimeTrend[]>(`${this.baseUrl}/time-trends`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching time trends:', error);
          return of([]);
        })
      );
  }

  getTechPerformance(startDate?: string, endDate?: string): Observable<TechPerformance[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TechPerformance[]>(`${this.baseUrl}/tech-performance`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching tech performance:', error);
          return of([]);
        })
      );
  }

  getTicketsByPriority(startDate?: string, endDate?: string): Observable<TicketByPriority[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByPriority[]>(`${this.baseUrl}/tickets-by-priority`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching tickets by priority:', error);
          return of([]);
        })
      );
  }

  getTicketsByArea(startDate?: string, endDate?: string): Observable<TicketByArea[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<TicketByArea[]>(`${this.baseUrl}/tickets-by-area`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching tickets by area:', error);
          return of([]);
        })
      );
  }

  getRecentActivity(limit: number = 10): Observable<RecentActivity[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<RecentActivity[]>(`${this.baseUrl}/recent-activity`, { params })
      .pipe(
        catchError(error => {
          console.error('Error fetching recent activity:', error);
          return of([]);
        })
      );
  }

  /**
   * Métodos utilitarios para análisis local
   */

  /**
   * Calcula la tendencia de productividad basada en datos históricos
   */
  calculateProductivityTrend(timeTrends: TimeTrend[]): number {
    if (timeTrends.length < 2) return 0;

    const recent = timeTrends.slice(-7);
    const previous = timeTrends.slice(-14, -7);

    if (recent.length === 0 || previous.length === 0) return 0;

    const recentAvg = recent.reduce((sum, t) => sum + t.tickets_closed, 0) / recent.length;
    const previousAvg = previous.reduce((sum, t) => sum + t.tickets_closed, 0) / previous.length;

    return previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
  }

  /**
   * Calcula el porcentaje de tickets críticos
   */
  calculateCriticalTicketsPercentage(ticketsByPriority: TicketByPriority[]): number {
    const total = ticketsByPriority.reduce((sum, p) => sum + p.count, 0);
    const critical = ticketsByPriority.find(p => p.priority === 'Urgente')?.count || 0;

    return total > 0 ? (critical / total) * 100 : 0;
  }

  /**
   * Calcula la tasa de escalación
   */
  calculateEscalationRate(ticketsByStatus: TicketByStatus[], totalTickets: number): number {
    const escalated = ticketsByStatus
      .filter(s => s.status.includes('Escalado'))
      .reduce((sum, s) => sum + s.count, 0);

    return totalTickets > 0 ? (escalated / totalTickets) * 100 : 0;
  }

  /**
   * Calcula la varianza en la distribución de carga de trabajo
   */
  calculateWorkloadVariance(techPerformance: TechPerformance[]): number {
    if (techPerformance.length < 2) return 0;

    const ticketCounts = techPerformance.map(tech => tech.total_tickets);
    const average = ticketCounts.reduce((sum, count) => sum + count, 0) / ticketCounts.length;
    const variance = ticketCounts.reduce((sum, count) => sum + Math.pow(count - average, 2), 0) / ticketCounts.length;

    return Math.sqrt(variance);
  }

  /**
   * Genera recomendaciones basadas en métricas
   */
  generateRecommendations(metrics: DashboardMetrics, techPerformance: TechPerformance[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Recomendación por bajo cumplimiento de SLA
    if (metrics.slaComplianceRate < 80) {
      recommendations.push({
        type: 'operational',
        priority: 'high',
        title: 'Mejorar Cumplimiento de SLA',
        description: 'El cumplimiento de SLA está por debajo del 80%. Se requiere acción inmediata.',
        expected_impact: 'Mejora en satisfacción del cliente y eficiencia operacional',
        estimated_effort: '2-3 semanas'
      });
    }

    // Recomendación por distribución desigual de trabajo
    const workloadVariance = this.calculateWorkloadVariance(techPerformance);
    if (workloadVariance > 5) {
      recommendations.push({
        type: 'resource',
        priority: 'medium',
        title: 'Balancear Carga de Trabajo',
        description: 'Se detectó una distribución desigual de tickets entre técnicos.',
        expected_impact: 'Mejor utilización de recursos y reducción de tiempo de respuesta',
        estimated_effort: '1-2 semanas'
      });
    }

    // Recomendación por baja tasa de cierre
    const avgClosureRate = techPerformance.reduce((sum, tech) => sum + tech.closure_rate, 0) / techPerformance.length;
    if (avgClosureRate < 70) {
      recommendations.push({
        type: 'strategic',
        priority: 'high',
        title: 'Capacitación del Equipo',
        description: 'La tasa promedio de cierre está por debajo del 70%. Se requiere capacitación.',
        expected_impact: 'Incremento en productividad y calidad del servicio',
        estimated_effort: '4-6 semanas'
      });
    }

    return recommendations;
  }
}
