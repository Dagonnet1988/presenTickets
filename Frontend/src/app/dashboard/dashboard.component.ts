/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Dashboard Ejecutivo - Herramienta de Análisis y Toma de Decisiones
 * Integra métricas avanzadas, visualizaciones y análisis predictivo
 */

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { Router } from '@angular/router';

import { AnalyticsService, DashboardMetrics, TechPerformance, TicketByStatus, TimeTrend, TicketByPriority, TicketByArea } from '../shared/services/analytics.service';
import { AdvancedAnalyticsService } from '../shared/services/advanced-analytics.service';
import { AuthService } from '../shared/services/auth.service';
import { TicketService } from '../shared/services/ticket.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatChipsModule,
    FormsModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private subscriptions = new Subscription();

  // Datos del dashboard
  dashboardMetrics: DashboardMetrics | null = null;
  techPerformance: TechPerformance[] = [];
  ticketsByStatus: TicketByStatus[] = [];
  timeTrends: TimeTrend[] = [];
  ticketsByPriority: TicketByPriority[] = [];
  ticketsByArea: TicketByArea[] = [];

  // Filtros de fecha
  startDate: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  endDate: Date = new Date();

  // Estados de carga
  isLoading = false;

  // Configuración de vista
  selectedPeriod: 'daily' | 'weekly' | 'monthly' = 'daily';
  userRole: string = '';

  // Métricas calculadas
  calculatedMetrics = {
    productivityTrend: 0,
    averageTicketsPerDay: 0,
    criticalTicketsPercentage: 0,
    backlogGrowthRate: 0,
    firstResponseTime: 0,
    customerSatisfactionScore: 0,
    escalationRate: 0,
    workloadDistribution: 0
  };

  // Alertas y recomendaciones
  alerts: Array<{
    type: 'warning' | 'error' | 'info' | 'success',
    message: string,
    action?: string
  }> = [];

  constructor(
    private analyticsService: AnalyticsService,
    private advancedAnalyticsService: AdvancedAnalyticsService,
    private authService: AuthService,
    private ticketService: TicketService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';
    this.loadDashboardData();

    // Actualizar datos cada 5 minutos
    const intervalId = setInterval(() => {
      this.loadDashboardData();
    }, 300000);

    this.subscriptions.add(() => clearInterval(intervalId));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * Carga todos los datos del dashboard
   */
  loadDashboardData(): void {
    this.isLoading = true;

    const startDateStr = this.formatDate(this.startDate);
    const endDateStr = this.formatDate(this.endDate);

    // Cargar todos los datos en paralelo
    this.subscriptions.add(
      forkJoin({
        metrics: this.advancedAnalyticsService.getDashboardMetrics(startDateStr, endDateStr),
        techPerformance: this.advancedAnalyticsService.getTechPerformance(startDateStr, endDateStr),
        ticketsByStatus: this.advancedAnalyticsService.getTicketsByStatus(startDateStr, endDateStr),
        timeTrends: this.advancedAnalyticsService.getTimeTrends(this.selectedPeriod, startDateStr, endDateStr),
        ticketsByPriority: this.advancedAnalyticsService.getTicketsByPriority(startDateStr, endDateStr),
        ticketsByArea: this.advancedAnalyticsService.getTicketsByArea(startDateStr, endDateStr)
      }).subscribe({
        next: (data) => {
          this.dashboardMetrics = data.metrics;
          this.techPerformance = data.techPerformance;
          this.ticketsByStatus = data.ticketsByStatus;
          this.timeTrends = data.timeTrends;
          this.ticketsByPriority = data.ticketsByPriority;
          this.ticketsByArea = data.ticketsByArea;

          this.calculateAdvancedMetrics();
          this.generateAlerts();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading dashboard data:', error);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      })
    );
  }

  /**
   * Calcula métricas avanzadas para análisis ejecutivo
   */
  calculateAdvancedMetrics(): void {
    if (!this.dashboardMetrics || !this.timeTrends.length) return;

    // Usar el servicio avanzado para cálculos más precisos
    this.calculatedMetrics.productivityTrend = this.advancedAnalyticsService.calculateProductivityTrend(this.timeTrends);

    // Tickets promedio por día
    const totalDays = this.timeTrends.length;
    const totalTickets = this.timeTrends.reduce((sum, t) => sum + t.tickets_created, 0);
    this.calculatedMetrics.averageTicketsPerDay = totalDays > 0 ? totalTickets / totalDays : 0;

    // Porcentaje de tickets críticos usando el servicio avanzado
    this.calculatedMetrics.criticalTicketsPercentage = this.advancedAnalyticsService.calculateCriticalTicketsPercentage(this.ticketsByPriority);

    // Tasa de escalación usando el servicio avanzado
    this.calculatedMetrics.escalationRate = this.advancedAnalyticsService.calculateEscalationRate(this.ticketsByStatus, this.dashboardMetrics.totalTickets);

    // Distribución de carga de trabajo usando el servicio avanzado
    this.calculatedMetrics.workloadDistribution = this.advancedAnalyticsService.calculateWorkloadVariance(this.techPerformance);

    // Calcular métricas adicionales
    this.calculatedMetrics.firstResponseTime = this.calculateFirstResponseTime();
    this.calculatedMetrics.customerSatisfactionScore = this.calculateCustomerSatisfactionScore();
    this.calculatedMetrics.backlogGrowthRate = this.calculateBacklogGrowthRate();
  }

  /**
   * Calcula la varianza en la distribución de carga de trabajo
   */
  calculateWorkloadVariance(): number {
    if (this.techPerformance.length < 2) return 0;

    const ticketCounts = this.techPerformance.map(tech => tech.total_tickets);
    const average = ticketCounts.reduce((sum, count) => sum + count, 0) / ticketCounts.length;
    const variance = ticketCounts.reduce((sum, count) => sum + Math.pow(count - average, 2), 0) / ticketCounts.length;

    return Math.sqrt(variance);
  }

  /**
   * Genera alertas y recomendaciones basadas en los datos
   */
  generateAlerts(): void {
    this.alerts = [];

    if (!this.dashboardMetrics) return;

    // Usar el servicio avanzado para generar recomendaciones
    const recommendations = this.advancedAnalyticsService.generateRecommendations(
      this.dashboardMetrics,
      this.techPerformance
    );

    // Convertir recomendaciones a alertas
    recommendations.forEach(rec => {
      let alertType: 'warning' | 'error' | 'info' | 'success' = 'info';

      switch (rec.priority) {
        case 'high':
          alertType = 'error';
          break;
        case 'medium':
          alertType = 'warning';
          break;
        case 'low':
          alertType = 'info';
          break;
      }

      this.alerts.push({
        type: alertType,
        message: rec.title,
        action: rec.description
      });
    });

    // Alertas adicionales específicas
    if (this.calculatedMetrics.criticalTicketsPercentage > 10) {
      this.alerts.push({
        type: 'warning',
        message: `Alto porcentaje de tickets críticos: ${this.calculatedMetrics.criticalTicketsPercentage.toFixed(1)}%`,
        action: 'Revisar priorización y recursos'
      });
    }

    if (this.calculatedMetrics.escalationRate > 15) {
      this.alerts.push({
        type: 'warning',
        message: `Alta tasa de escalación: ${this.calculatedMetrics.escalationRate.toFixed(1)}%`,
        action: 'Capacitar equipo o revisar procesos'
      });
    }

    if (this.calculatedMetrics.workloadDistribution > 5) {
      this.alerts.push({
        type: 'info',
        message: `Distribución de carga desigual detectada`,
        action: 'Balancear asignaciones entre técnicos'
      });
    }

    if (this.calculatedMetrics.productivityTrend < -10) {
      this.alerts.push({
        type: 'warning',
        message: `Tendencia de productividad negativa: ${this.calculatedMetrics.productivityTrend.toFixed(1)}%`,
        action: 'Identificar cuellos de botella'
      });
    }

    if (this.calculatedMetrics.productivityTrend > 10) {
      this.alerts.push({
        type: 'success',
        message: `Excelente mejora en productividad: +${this.calculatedMetrics.productivityTrend.toFixed(1)}%`,
        action: 'Mantener las mejores prácticas'
      });
    }
  }

  /**
   * Calcula el tiempo promedio de primera respuesta
   */
  private calculateFirstResponseTime(): number {
    // Implementación simplificada - en producción se obtendría del backend
    return 2.5; // horas promedio
  }

  /**
   * Calcula el puntaje de satisfacción del cliente
   */
  private calculateCustomerSatisfactionScore(): number {
    // Implementación simplificada - en producción se obtendría del backend
    return 4.2; // puntaje sobre 5
  }

  /**
   * Calcula la tasa de crecimiento del backlog
   */
  private calculateBacklogGrowthRate(): number {
    if (this.timeTrends.length < 2) return 0;

    const recent = this.timeTrends.slice(-7);
    const previous = this.timeTrends.slice(-14, -7);

    if (recent.length === 0 || previous.length === 0) return 0;

    const recentBacklog = recent.reduce((sum, t) => sum + (t.tickets_created - t.tickets_closed), 0);
    const previousBacklog = previous.reduce((sum, t) => sum + (t.tickets_created - t.tickets_closed), 0);

    return previousBacklog !== 0 ? ((recentBacklog - previousBacklog) / Math.abs(previousBacklog)) * 100 : 0;
  }

  /**
   * Actualiza el período de visualización
   */
  onPeriodChange(): void {
    this.loadDashboardData();
  }

  /**
   * Actualiza las fechas y recarga los datos
   */
  onDateRangeChange(): void {
    this.loadDashboardData();
  }

  /**
   * Formatea una fecha para el backend
   */
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Navega a la vista de tickets filtrada
   */
  navigateToTickets(filter?: string): void {
    const params: any = {};

    switch (filter) {
      case 'open':
        params.status = 'abiertos';
        break;
      case 'critical':
        params.priority = 'Urgente';
        break;
      case 'escalated':
        params.status = 'escaladoExterno';
        break;
      case 'unassigned':
        params.assignedTo = 'noAsignado';
        break;
      default:
        break;
    }

    this.router.navigate(['/'], { queryParams: params });
  }

  /**
   * Obtiene el color para un indicador de rendimiento
   */
  getPerformanceColor(value: number, thresholds: { good: number, warning: number }): string {
    if (value >= thresholds.good) return 'primary';
    if (value >= thresholds.warning) return 'accent';
    return 'warn';
  }

  /**
   * Obtiene el ícono para un tipo de alerta
   */
  getAlertIcon(type: string): string {
    switch (type) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      case 'success': return 'check_circle';
      default: return 'info';
    }
  }

  /**
   * Calcula el porcentaje de tickets cerrados de manera segura
   */
  getClosedTicketsPercentage(): string {
    if (!this.dashboardMetrics?.totalTickets || this.dashboardMetrics.totalTickets === 0) {
      return '0';
    }
    const percentage = ((this.dashboardMetrics.closedTickets || 0) / this.dashboardMetrics.totalTickets) * 100;
    return percentage.toFixed(1);
  }

  /**
   * Obtiene el porcentaje de distribución de manera segura
   */
  getDistributionPercentage(count: number): number {
    if (!this.dashboardMetrics?.totalTickets || this.dashboardMetrics.totalTickets === 0) {
      return 0;
    }
    return (count / this.dashboardMetrics.totalTickets) * 100;
  }

  /**
   * Obtiene el texto descriptivo para SLA compliance
   */
  getSlaComplianceText(): string {
    const rate = this.dashboardMetrics?.slaComplianceRate || 0;
    if (rate >= 90) return 'Excelente';
    if (rate >= 80) return 'Bueno';
    return 'Requiere mejora';
  }
}
