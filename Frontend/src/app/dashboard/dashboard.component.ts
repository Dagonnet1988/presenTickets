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
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
// import { NgChartsModule } from 'ng2-charts';
// import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

import { AnalyticsService, DashboardMetrics, TicketByStatus, TechPerformance, TicketByArea } from '../shared/services/analytics.service';
import { DashboardConfigService, DashboardConfig } from '../shared/services/dashboard-config.service';
import { AuthService } from '../shared/services/auth.service';
import { SurveyService, SurveyStats } from '../shared/services/survey.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
    MatExpansionModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatPaginatorModule,
    // NgChartsModule // Removido temporalmente por problemas de compatibilidad
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Control de roles
  userRole: string = '';
  isAdmin: boolean = false;
  isTech: boolean = false;
  showConfigPanel: boolean = false;

  // Datos del dashboard
  metrics: DashboardMetrics | null = null;
  configuration: DashboardConfig | null = null;
  ticketsByStatus: TicketByStatus[] = [];
  techPerformance: TechPerformance[] = [];
  ticketsByArea: TicketByArea[] = [];
  surveyStats: SurveyStats | null = null;

  // Estados de loading
  loading = {
    metrics: false,
    config: false,
    saving: false,
    charts: false,
    performance: false,
    areas: false,
    surveys: false
  };

  // Configuración del gráfico removida temporalmente por problemas de compatibilidad

  // Control de paginación para tabla de tickets
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  currentPage = 0;
  paginatedTickets: any[] = [];

  // Formularios
  dateFilterForm!: FormGroup;
  configForm!: FormGroup;

  // Filtros de fecha
  dateRanges = [
    { label: 'Todos los tickets', value: 'all' },
    { label: 'Hoy', value: 'today' },
    { label: 'Esta semana', value: 'week' },
    { label: 'Este mes', value: 'month' },
    { label: 'Últimos 3 meses', value: '3months' },
    { label: 'Personalizado', value: 'custom' }
  ];

  // Columnas para tabla de tickets detallados
  ticketColumns: string[] = ['id', 'subject', 'status', 'priority', 'realWorkTime', 'responseTime', 'isOverdue', 'surveyRating'];

  // Subscripciones
  private subscriptions: Subscription[] = [];

  constructor(
    private analyticsService: AnalyticsService,
    private configService: DashboardConfigService,
    private authService: AuthService,
    private surveyService: SurveyService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {
    this.initializeForms();
    this.setupRoleBasedAccess();
  }

  ngOnInit() {
    this.loadInitialData();
    this.setupConfigChangeListener();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Inicializar formularios
   */
  private initializeForms() {
    // Formulario de filtros de fecha
    this.dateFilterForm = this.fb.group({
      dateRange: ['month'], // Cambiar por defecto a mostrar este mes
      startDate: [null],
      endDate: [null]
    });

    // Formulario de configuración (solo Admin)
    this.configForm = this.fb.group({
      // Horarios laborales
      work_hours_start: ['', [Validators.required, Validators.pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)]],
      work_hours_end: ['', [Validators.required, Validators.pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)]],
      work_hours_friday_end: ['', [Validators.required, Validators.pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)]],
      lunch_break_start: ['', [Validators.required, Validators.pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)]],
      lunch_break_end: ['', [Validators.required, Validators.pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)]],

      // Metas de tiempo
      target_response_time: [240, [Validators.required, Validators.min(1), Validators.max(10080)]], // max 1 semana
      target_resolution_time: [1440, [Validators.required, Validators.min(1), Validators.max(20160)]], // max 2 semanas

      // SLA por prioridad
      sla_critical: [60, [Validators.required, Validators.min(1), Validators.max(1440)]],
      sla_high: [240, [Validators.required, Validators.min(1), Validators.max(2880)]],
      sla_medium: [480, [Validators.required, Validators.min(1), Validators.max(4320)]],
      sla_low: [1440, [Validators.required, Validators.min(1), Validators.max(10080)]]
    });

    // Escuchar cambios en el selector de rango de fechas
    this.dateFilterForm.get('dateRange')?.valueChanges.subscribe(value => {
      if (value !== 'custom') {
        this.applyDateRange(value);
      }
    });
  }

  /**
   * Configurar acceso basado en roles
   */
  private setupRoleBasedAccess() {
    this.userRole = this.authService.getUserRole() || '';
    this.isAdmin = this.userRole === 'admin';
    this.isTech = this.userRole === 'tech';
    this.showConfigPanel = this.isAdmin; // Solo admin ve configuración
  }

  /**
   * Cargar datos iniciales
   */
  private loadInitialData() {
    // Aplicar filtro de mes por defecto
    this.applyDateRange('month');

    this.loadMetrics();
    this.loadChartData();
    this.loadTechPerformance();
    this.loadAreaAnalysis();
    this.loadSurveyStats();

    if (this.isAdmin) {
      this.loadConfiguration();
    }
  }

  /**
   * Configurar listener para cambios de configuración
   */
  private setupConfigChangeListener() {
    if (this.isAdmin) {
      const configSub = this.configService.configChanged$.subscribe(changed => {
        if (changed) {
          // Recargar métricas cuando cambie la configuración
          this.loadMetrics();
        }
      });
      this.subscriptions.push(configSub);
    }
  }

  /**
   * Cargar métricas del dashboard
   */
  loadMetrics() {
    this.loading.metrics = true;

    const dateParams = this.getDateParams();

    const metricsSub = this.analyticsService.getDashboardMetrics(dateParams)
      .pipe(finalize(() => this.loading.metrics = false))
      .subscribe({
        next: (data) => {
          this.metrics = data;
          // Actualizar paginación cuando cambien los datos
          this.currentPage = 0; // Reiniciar a la primera página
          this.updatePaginatedTickets();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando métricas:', error);
          this.showError('Error al cargar las métricas del dashboard');
        }
      });

    this.subscriptions.push(metricsSub);

    // También recargar datos de gráficos y análisis
    this.loadChartData();
    this.loadTechPerformance();
    this.loadAreaAnalysis();
  }

  /**
   * Cargar datos para el gráfico de torta
   */
  loadChartData() {
    this.loading.charts = true;

    const dateParams = this.getDateParams();

    const chartSub = this.analyticsService.getTicketsByStatus(dateParams.startDate, dateParams.endDate)
      .pipe(finalize(() => this.loading.charts = false))
      .subscribe({
        next: (data) => {
          this.ticketsByStatus = data;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando datos del gráfico:', error);
          this.showError('Error al cargar datos del gráfico');
        }
      });

    this.subscriptions.push(chartSub);
  }

  /**
   * Obtener datos de estados activos para la visualización
   */
  getActiveStatusData() {
    // Ya no necesitamos filtrar ni recalcular, el backend ya envía solo estados activos con % correctos
    const activeStatuses = this.ticketsByStatus.filter(item =>
      item.status !== 'Cerrado' && item.status !== 'Resuelto'
    );

    // SIMPLIFICADO: El backend ya calcula porcentajes sobre tickets abiertos
    return activeStatuses.map(item => ({
      status: item.status,
      count: item.count,
      percentage: parseFloat(String(item.percentage || 0))  // Convertir a número de forma segura
    }));
  }

  /**
   * Cargar rendimiento por técnico
   */
  loadTechPerformance() {
    // Solo mostrar para administradores
    if (!this.isAdmin) return;

    this.loading.performance = true;

    const dateParams = this.getDateParams();

    const performanceSub = this.analyticsService.getTechPerformance(dateParams.startDate, dateParams.endDate)
      .pipe(finalize(() => this.loading.performance = false))
      .subscribe({
        next: (data) => {
          this.techPerformance = data;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando rendimiento por técnico:', error);
          this.showError('Error al cargar datos de rendimiento');
        }
      });

    this.subscriptions.push(performanceSub);
  }

  /**
   * Cargar análisis por área
   */
  loadAreaAnalysis() {
    this.loading.areas = true;

    const dateParams = this.getDateParams();

    const areasSub = this.analyticsService.getTicketsByArea(dateParams.startDate, dateParams.endDate)
      .pipe(finalize(() => this.loading.areas = false))
      .subscribe({
        next: (data) => {
          this.ticketsByArea = data;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando análisis por área:', error);
          this.showError('Error al cargar análisis por área');
        }
      });

    this.subscriptions.push(areasSub);
  }

  /**
   * Cargar estadísticas de encuestas de satisfacción
   */
  loadSurveyStats() {
    // Solo mostrar para administradores y técnicos
    if (this.userRole === 'user') return;

    this.loading.surveys = true;

    const surveysSub = this.surveyService.getStats()
      .pipe(finalize(() => this.loading.surveys = false))
      .subscribe({
        next: (data) => {
          this.surveyStats = data;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando estadísticas de encuestas:', error);
          // No mostrar error al usuario, simplemente no mostrar la sección
          this.surveyStats = null;
        }
      });

    this.subscriptions.push(surveysSub);
  }

  /**
   * Generar array de estrellas para mostrar calificación
   */
  getStarsArray(rating: number): string[] {
    const stars: string[] = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push('star');
      } else if (i === fullStars && hasHalfStar) {
        stars.push('star_half');
      } else {
        stars.push('star_border');
      }
    }
    return stars;
  }

  /**
   * Cargar configuración (solo Admin)
   */
  loadConfiguration() {
    if (!this.isAdmin) return;

    this.loading.config = true;

    const configSub = this.configService.getConfiguration()
      .pipe(finalize(() => this.loading.config = false))
      .subscribe({
        next: (config) => {
          this.configuration = config;
          this.populateConfigForm(config);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando configuración:', error);
          this.showError('Error al cargar la configuración');
        }
      });

    this.subscriptions.push(configSub);
  }

  /**
   * Poblar formulario de configuración con datos actuales
   */
  private populateConfigForm(config: DashboardConfig) {
    const flatConfig = this.configService.flattenConfig(config);
    this.configForm.patchValue(flatConfig);
  }

  /**
   * Aplicar rango de fechas predefinido
   */
  private applyDateRange(range: string) {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    switch (range) {
      case 'all':
        // No aplicar filtros de fecha, mostrar todos los tickets
        this.dateFilterForm.patchValue({
          startDate: null,
          endDate: null
        }, { emitEvent: false });
        this.loadMetrics();
        return;
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case '3months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      default:
        return;
    }

    this.dateFilterForm.patchValue({
      startDate,
      endDate
    }, { emitEvent: false });

    this.loadMetrics();
  }

  /**
   * Obtener parámetros de fecha según el filtro seleccionado
   */
  private getDateParams(): { startDate?: string, endDate?: string } {
    const formValue = this.dateFilterForm.value;

    // Si es 'all', no enviar parámetros de fecha
    if (formValue.dateRange === 'all') {
      return {};
    }

    if (formValue.dateRange === 'custom' && formValue.startDate && formValue.endDate) {
      return {
        startDate: formValue.startDate.toISOString(),
        endDate: formValue.endDate.toISOString()
      };
    } else if (formValue.dateRange !== 'custom') {
      // Para rangos predefinidos, usar las fechas calculadas por applyDateRange
      if (formValue.startDate && formValue.endDate) {
        return {
          startDate: formValue.startDate.toISOString(),
          endDate: formValue.endDate.toISOString()
        };
      }
    }

    return {};
  }

  /**
   * Guardar configuración (solo Admin)
   */
  saveConfiguration() {
    if (!this.isAdmin || !this.configForm.valid) {
      this.showError('Formulario inválido. Verifique los campos marcados en rojo.');
      return;
    }

    this.loading.saving = true;
    const configValues = this.configForm.value;

    const saveSub = this.configService.updateConfiguration(configValues)
      .pipe(finalize(() => this.loading.saving = false))
      .subscribe({
        next: (response) => {
          this.showSuccess(`Configuración actualizada: ${response.updated_count} valores modificados`);
          this.loadConfiguration(); // Recargar para mostrar valores actualizados
        },
        error: (error) => {
          console.error('Error guardando configuración:', error);
          this.showError(error.error?.message || 'Error al guardar la configuración');
        }
      });

    this.subscriptions.push(saveSub);
  }

  /**
   * Restablecer configuración a valores por defecto (solo Admin)
   */
  resetConfiguration() {
    if (!this.isAdmin) return;

    if (!confirm('¿Está seguro de restablecer la configuración a los valores por defecto?')) {
      return;
    }

    this.loading.saving = true;

    const resetSub = this.configService.resetToDefaults()
      .pipe(finalize(() => this.loading.saving = false))
      .subscribe({
        next: (response) => {
          this.showSuccess(response.message);
          this.loadConfiguration(); // Recargar configuración
        },
        error: (error) => {
          console.error('Error restableciendo configuración:', error);
          this.showError('Error al restablecer la configuración');
        }
      });

    this.subscriptions.push(resetSub);
  }

  /**
   * Aplicar filtros personalizados
   */
  applyCustomFilter() {
    const formValue = this.dateFilterForm.value;

    if (!formValue.startDate || !formValue.endDate) {
      this.showError('Seleccione fechas de inicio y fin');
      return;
    }

    if (formValue.startDate > formValue.endDate) {
      this.showError('La fecha de inicio debe ser anterior a la fecha de fin');
      return;
    }

    this.loadMetrics();
  }

  /**
   * Obtener color para indicador de compliance
   */
  getComplianceColor(percentage: number): string {
    if (percentage >= 90) return 'primary';
    if (percentage >= 70) return 'accent';
    return 'warn';
  }

  /**
   * Obtener icono para estado de ticket
   */
  getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'creado': return 'fiber_new';
      case 'en revisión': return 'visibility';
      case 'en gestión': return 'build';
      case 'escalado a externo': return 'call_made';
      case 'esperando respuesta del usuario': return 'schedule';
      case 'resuelto': return 'check_circle';
      case 'cerrado': return 'lock';
      default: return 'help_outline';
    }
  }

  /**
   * Obtener clase CSS para prioridad
   */
  getPriorityClass(priority: string): string {
    switch (priority?.toLowerCase()) {
      case 'crítica': return 'priority-critical';
      case 'alta': return 'priority-high';
      case 'media': return 'priority-medium';
      case 'baja': return 'priority-low';
      default: return 'priority-unknown';
    }
  }

  /**
   * Formatear tiempo en minutos
   */
  formatMinutes(minutes: number): string {
    return this.configService.formatMinutes(minutes);
  }

  /**
   * Obtener áreas agrupadas y ordenadas por cantidad de tickets
   */
  getTopAreas() {
    const areaGroups: { [key: string]: any } = {};

    // Agrupar por área
    this.ticketsByArea.forEach(item => {
      const areaKey = item.area || 'Sin área';

      if (!areaGroups[areaKey]) {
        areaGroups[areaKey] = {
          area: areaKey,
          totalCount: 0,
          categories: []
        };
      }

      areaGroups[areaKey].totalCount += parseInt(item.count.toString(), 10);
      areaGroups[areaKey].categories.push({
        category: item.category,
        count: parseInt(item.count.toString(), 10)
      });
    });

    // Convertir a array y ordenar por total de tickets
    return Object.values(areaGroups)
      .sort((a: any, b: any) => b.totalCount - a.totalCount)
      .slice(0, 6); // Solo mostrar top 6 áreas
  }

  /**
   * Obtener clase CSS para indicador de rendimiento
   */
  getPerformanceClass(percentage: number): string {
    if (percentage >= 90) return 'performance-excellent';
    if (percentage >= 70) return 'performance-good';
    if (percentage >= 50) return 'performance-fair';
    return 'performance-poor';
  }

  /**
   * Obtener texto de estado de rendimiento
   */
  getPerformanceStatus(percentage: number): string {
    if (percentage >= 90) return 'Excelente';
    if (percentage >= 70) return 'Bueno';
    if (percentage >= 50) return 'Regular';
    return 'Requiere atención';
  }

  /**
   * Calcular puntaje general de recomendación
   */
  getRecommendationScore(): number {
    if (!this.metrics) return 0;

    const responseScore = this.metrics.responseTimeCompliance;
    const workScore = this.metrics.workTimeCompliance;
    const overdueScore = this.metrics.ticketsOverdue === 0 ? 100 : Math.max(0, 100 - (this.metrics.ticketsOverdue * 10));

    return Math.round((responseScore + workScore + overdueScore) / 3);
  }

  /**
   * Mostrar mensaje de éxito
   */
  private showSuccess(message: string) {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  /**
   * Mostrar mensaje de error
   */
  private showError(message: string) {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  /**
   * Manejar cambio de página en la tabla de tickets
   */
  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePaginatedTickets();
  }

  /**
   * Actualizar tickets paginados
   */
  private updatePaginatedTickets() {
    if (!this.metrics?.detailed) {
      this.paginatedTickets = [];
      return;
    }

    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedTickets = this.metrics.detailed.slice(startIndex, endIndex);
  }

  /**
   * Obtener total de tickets para el paginador
   */
  getTotalTickets(): number {
    return this.metrics?.detailed?.length || 0;
  }
}
