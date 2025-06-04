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

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule, DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  AnalyticsService,
  DashboardMetrics,
  TicketByStatus,
  TechPerformance,
  TimeTrend,
  RecentActivity
} from '../shared/services/analytics.service';
import { AuthService } from '../shared/services/auth.service';

// DateAdapter personalizado para formato dd/mm/yyyy
class CustomDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: Object): string {
    if (displayFormat === 'DD/MM/YYYY') {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    return super.format(date, displayFormat);
  }

  override parse(value: any): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const str = value.trim();
      if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = str.split('/');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Los meses son 0-indexados
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
          return date;
        }
      }
    }
    return super.parse(value);
  }
}

// Formato de fecha personalizado para dd/mm/yyyy
export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'DD/MM/YYYY',
  },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'DD/MM/YYYY',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    ReactiveFormsModule
  ],  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-ES' },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: DateAdapter, useClass: CustomDateAdapter }
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  // Datos del dashboard
  dashboardMetrics: DashboardMetrics | null = null;
  ticketsByStatus: TicketByStatus[] = [];
  techPerformance: TechPerformance[] = [];
  timeTrends: TimeTrend[] = [];
  recentActivity: RecentActivity[] = [];

  // Estado de carga
  loading = {
    dashboard: false,
    status: false,
    performance: false,
    trends: false,
    activity: false
  };

  // Formulario de filtros de fecha
  dateFilterForm: FormGroup;

  // Subscripciones
  private subscriptions = new Subscription();

  // Columnas para las tablas
  performanceColumns: string[] = ['name', 'total_tickets', 'closed_tickets', 'closure_rate', 'avg_resolution_hours'];
  activityColumns: string[] = ['activity_type', 'title', 'user_name', 'activity_date', 'status', 'priority'];
  constructor(
    private analyticsService: AnalyticsService,
    private authService: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    // Calcular fechas de la semana actual
    const weekDates = this.getCurrentWeekDates();

    this.dateFilterForm = this.fb.group({
      startDate: [weekDates.startDate],
      endDate: [weekDates.endDate],
      period: ['weekly']
    });
  }
  /**
   * Obtiene las fechas de inicio y fin de la semana actual
   */
  private getCurrentWeekDates(): { startDate: Date, endDate: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = domingo, 1 = lunes, etc.

    // Calcular inicio de semana (lunes)
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startDate.setHours(0, 0, 0, 0);

    // Calcular fin de semana (domingo)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  /**
   * Verifica si una fecha está en el período actual
   */
  isCurrentPeriod(period: 'today' | 'week' | 'month'): boolean {
    const formValue = this.dateFilterForm.value;
    if (!formValue.startDate || !formValue.endDate) return false;

    const startDate = new Date(formValue.startDate);
    const endDate = new Date(formValue.endDate);

    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endToday = new Date(today);
        endToday.setHours(23, 59, 59, 999);
        return startDate.getTime() === today.getTime() &&
               endDate.getTime() === endToday.getTime();

      case 'week':
        const weekDates = this.getCurrentWeekDates();
        return startDate.getTime() === weekDates.startDate.getTime() &&
               endDate.getTime() === weekDates.endDate.getTime();

      case 'month':
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        return startDate.getTime() === startOfMonth.getTime() &&
               endDate.getTime() === endOfMonth.getTime();

      default:
        return false;
    }
  }

  ngOnInit(): void {
    // Verificar permisos
    if (!this.hasAdminAccess()) {
      return;
    }

    // Cargar datos iniciales
    this.loadAllData();

    // Suscribirse a cambios en los filtros de fecha
    this.subscriptions.add(
      this.dateFilterForm.valueChanges.subscribe(() => {
        this.loadAllData();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  hasAdminAccess(): boolean {
    const userRole = this.authService.getUserRole();
    return userRole === 'admin' || userRole === 'tech';
  }

  /**
   * Carga todos los datos del dashboard
   */
  loadAllData(): void {
    const { startDate, endDate } = this.getDateRange();

    this.loadDashboardMetrics(startDate, endDate);
    this.loadTicketsByStatus(startDate, endDate);
    this.loadTechPerformance(startDate, endDate);
    this.loadTimeTrends(startDate, endDate);
    this.loadRecentActivity();
  }

  /**
   * Obtiene el rango de fechas del formulario
   */
  private getDateRange(): { startDate?: string, endDate?: string } {
    const formValue = this.dateFilterForm.value;
    return {
      startDate: formValue.startDate ? formValue.startDate.toISOString().split('T')[0] : undefined,
      endDate: formValue.endDate ? formValue.endDate.toISOString().split('T')[0] : undefined
    };
  }

  /**
   * Carga métricas generales del dashboard
   */
  loadDashboardMetrics(startDate?: string, endDate?: string): void {
    this.loading.dashboard = true;

    this.subscriptions.add(
      this.analyticsService.getDashboardMetrics(startDate, endDate)
        .pipe(finalize(() => {
          this.loading.dashboard = false;
          this.cdr.detectChanges();
        }))
        .subscribe({
          next: (metrics) => {
            this.dashboardMetrics = metrics;
          },
          error: (error) => {
            console.error('Error al cargar métricas del dashboard:', error);
          }
        })
    );
  }

  /**
   * Carga tickets por estado
   */
  loadTicketsByStatus(startDate?: string, endDate?: string): void {
    this.loading.status = true;

    this.subscriptions.add(
      this.analyticsService.getTicketsByStatus(startDate, endDate)
        .pipe(finalize(() => {
          this.loading.status = false;
          this.cdr.detectChanges();
        }))
        .subscribe({
          next: (data) => {
            this.ticketsByStatus = data;
          },
          error: (error) => {
            console.error('Error al cargar tickets por estado:', error);
          }
        })
    );
  }

  /**
   * Carga performance de técnicos
   */
  loadTechPerformance(startDate?: string, endDate?: string): void {
    this.loading.performance = true;

    this.subscriptions.add(
      this.analyticsService.getTechPerformance(startDate, endDate)
        .pipe(finalize(() => {
          this.loading.performance = false;
          this.cdr.detectChanges();
        }))
        .subscribe({
          next: (data) => {
            this.techPerformance = data;
          },
          error: (error) => {
            console.error('Error al cargar performance de técnicos:', error);
          }
        })
    );
  }

  /**
   * Carga tendencias temporales
   */
  loadTimeTrends(startDate?: string, endDate?: string): void {
    this.loading.trends = true;
    const period = this.dateFilterForm.value.period || 'daily';

    this.subscriptions.add(
      this.analyticsService.getTimeTrends(period, startDate, endDate)
        .pipe(finalize(() => {
          this.loading.trends = false;
          this.cdr.detectChanges();
        }))
        .subscribe({
          next: (data) => {
            this.timeTrends = data;
          },
          error: (error) => {
            console.error('Error al cargar tendencias temporales:', error);
          }
        })
    );
  }

  /**
   * Carga actividad reciente
   */
  loadRecentActivity(): void {
    this.loading.activity = true;

    this.subscriptions.add(
      this.analyticsService.getRecentActivity(15)
        .pipe(finalize(() => {
          this.loading.activity = false;
          this.cdr.detectChanges();
        }))
        .subscribe({
          next: (data) => {
            this.recentActivity = data;
          },
          error: (error) => {
            console.error('Error al cargar actividad reciente:', error);
          }
        })
    );
  }
  /**
   * Limpia los filtros de fecha y vuelve a la semana actual
   */
  clearDateFilters(): void {
    const weekDates = this.getCurrentWeekDates();
    this.dateFilterForm.patchValue({
      startDate: weekDates.startDate,
      endDate: weekDates.endDate,
      period: 'weekly'
    });
  }

  /**
   * Configura filtros para el día actual
   */
  setToday(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);

    this.dateFilterForm.patchValue({
      startDate: today,
      endDate: endToday,
      period: 'daily'
    });
  }

  /**
   * Configura filtros para la semana actual
   */
  setThisWeek(): void {
    const weekDates = this.getCurrentWeekDates();
    this.dateFilterForm.patchValue({
      startDate: weekDates.startDate,
      endDate: weekDates.endDate,
      period: 'weekly'
    });
  }

  /**
   * Configura filtros para el mes actual
   */
  setThisMonth(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    this.dateFilterForm.patchValue({
      startDate: startOfMonth,
      endDate: endOfMonth,
      period: 'monthly'
    });
  }

  /**
   * Obtiene el color para el estado del ticket
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'Creado':
        return '#4CAF50';
      case 'En gestión':
        return '#2196F3';
      case 'Esperando respuesta del usuario':
        return '#FF9800';
      case 'Escalado a externo':
        return '#FF5722';
      case 'Escalado a Tier 3 / Gerente de Cuenta':
        return '#9C27B0';
      case 'Resuelto':
        return '#8BC34A';
      case 'Cerrado':
        return '#607D8B';
      default:
        return '#9E9E9E';
    }
  }

  /**
   * Obtiene el color para la prioridad del ticket
   */
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'Urgente':
        return '#F44336';
      case 'Alta':
        return '#FF9800';
      case 'Media':
        return '#FFC107';
      case 'Baja':
        return '#4CAF50';
      default:
        return '#9E9E9E';
    }
  }

  /**
   * Formatea el tipo de actividad
   */
  formatActivityType(type: string): string {
    switch (type) {
      case 'ticket_created':
        return 'Ticket Creado';
      case 'comment_added':
        return 'Comentario Agregado';
      default:
        return type;
    }
  }

  /**
   * Formatea la fecha para mostrar
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Calcula el porcentaje de resolución por estado
   */
  getResolutionPercentage(status: TicketByStatus): number {
    if (!this.dashboardMetrics) return 0;
    return Math.round((status.count / this.dashboardMetrics.totalTickets) * 100);
  }
  /**
   * Refresca todos los datos
   */
  refreshAllData(): void {
    this.loadAllData();
  }

  /**
   * Obtiene una descripción del período actual seleccionado
   */
  getCurrentPeriodDescription(): string {
    const formValue = this.dateFilterForm.value;
    if (!formValue.startDate || !formValue.endDate) {
      return 'Período personalizado';
    }

    const startDate = new Date(formValue.startDate);
    const endDate = new Date(formValue.endDate);

    // Verificar si es hoy
    if (this.isCurrentPeriod('today')) {
      return 'Hoy - ' + startDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Verificar si es esta semana
    if (this.isCurrentPeriod('week')) {
      return 'Esta Semana - ' + startDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
      }) + ' al ' + endDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }

    // Verificar si es este mes
    if (this.isCurrentPeriod('month')) {
      return 'Este Mes - ' + startDate.toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric'
      });
    }

    // Período personalizado
    return 'Período personalizado - ' + startDate.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    }) + ' al ' + endDate.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
}
