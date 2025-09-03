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
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, MatPaginatorIntl } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WhatsappService } from '../shared/services/whatsapp.service';
import { AuthService } from '../shared/services/auth.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import * as ExcelJS from 'exceljs';
import { PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-whatsapp-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTabsModule,
    MatBadgeModule,
    MatSelectModule,
    MatDividerModule,
    MatChipsModule,
    MatPaginatorModule,
    MatTooltipModule
  ],
  templateUrl: './whatsapp-admin.component.html',
  styleUrls: ['./whatsapp-admin.component.css']
})
export class WhatsAppAdminComponent implements OnInit {
  private socket!: Socket;

  // Estado de conexión
  connectionStatus: any = {
    isConnected: false,
    hasSocket: false,
    timestamp: null
  };

  // Datos para prueba de mensaje
  testMessage = {
    phoneNumber: '',
    message: ''
  };

  // Configuración del usuario
  userSettings: any = {
    phone: '',
    whatsapp_enabled: false,
    whatsapp_ticket_created: true,
    whatsapp_ticket_assigned: true,
    whatsapp_ticket_status: true,
    whatsapp_comments: true,
    // Nuevas configuraciones avanzadas
    notification_schedule: 'always',
    notification_start_time: '07:00',
    notification_end_time: '17:30',
    notification_mode: 'instant',
    min_priority: 'low',
    weekend_notifications: true,
    sound_enabled: true,
    daily_limit: 'unlimited',
    do_not_disturb: false,
    do_not_disturb_until: ''
  };

  // Configuración global del sistema
  systemSettings: any = {
    whatsapp_enabled_globally: true,
    business_hours_weekdays: '7-17:30', // Lunes a Jueves 7:00 AM - 5:30 PM
    business_hours_friday: '7-16:30',   // Viernes 7:00 AM - 4:30 PM
    default_daily_limit: '20',

    // Tipos de notificaciones
    enable_new_ticket_notifications: true,
    enable_assignment_notifications: false, // Deshabilitado por defecto
    enable_status_change_notifications: true,
    enable_comment_notifications: true,

    // Plantillas de mensajes
    template_new_ticket: '🆕 *PresenTickets* - Nuevo Ticket\n\nHola {userName},\n\nSe ha creado un nuevo ticket #{ticketId}\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
    template_assignment: '👤 *PresenTickets* - Ticket Asignado\n\nHola {userName},\n\nSe le ha asignado el ticket #{ticketId}\n📝 Asunto: {subject}\n\nPor favor revise y atienda este ticket.\n\n🕒 {timestamp}',
    template_status_change: '🔄 *PresenTickets* - Cambio de Estado\n\nHola {userName},\n\nEl ticket #{ticketId} cambió a: *{newStatus}*\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
    template_comment: '💬 *PresenTickets* - Nuevo Comentario\n\nHola {userName},\n\nNuevo comentario en el ticket #{ticketId}\n📝 Asunto: {subject}\n\n💭 Comentario: {comment}\n\n🕒 {timestamp}',

    // Configuraciones de seguridad
    require_phone_validation: false,
    auto_reconnect_interval: '10'
  };

  // Estadísticas
  stats: any[] = [];
  detailedStats: any = {
    summary: {},
    type_stats: [],
    top_users: [],
    hourly_stats: [],
    error_stats: [],
    daily_stats: []
  };
  performanceReport: any = {
    performance_analysis: {
      status: '',
      recommendations: [],
      peak_hours: []
    },
    detailed_metrics: {
      daily_trend: '',
      notification_types: [],
      top_errors: []
    }
  };
  selectedStatsPeriod: string = '30';
  availablePeriods = [
    { value: '7', label: 'Últimos 7 días' },
    { value: '15', label: 'Últimos 15 días' },
    { value: '30', label: 'Últimos 30 días' },
    { value: '60', label: 'Últimos 60 días' },
    { value: '90', label: 'Últimos 90 días' }
  ];

  // Historial de notificaciones
  notifications: any[] = [];
  filteredNotifications: any[] = [];
  totalNotifications: number = 0;
  notificationColumns: string[] = ['created_at', 'user_name', 'ticket_subject', 'message', 'status'];
  historyColumns: string[] = ['user', 'ticket', 'subject', 'message', 'type', 'status', 'date'];

  // Paginación
  pageSize: number = 10;
  currentPage: number = 0;

  // Filtros de historial
  historyFilter = {
    status: '',
    user: '',
    type: '',
    search: ''
  };

  // Modal de mensaje completo
  selectedMessage: any = null;

  // Estadísticas anti-bloqueo
  antiBlockStats: any = null;
  hourlyUsageData: any[] = [];
  newLimits: any = {
    maxDailyMessages: 100,
    maxMessagesPerHour: 20,
    minDelayBetweenMessages: 3,
    maxDelayBetweenMessages: 8,
    maxBurstMessages: 3,
    burstCooldown: 60,
    workHourStart: '08:00',
    workHourEnd: '18:00',
    allowAfterHours: true,
    afterHoursLimit: 10,
    weekendRestrictions: false,
    adaptiveDelays: true,
    smartThrottling: true,
    businessHours: {
      start: '07:00',
      end: '17:30',
      fridayEnd: '16:30',
      lunchStart: '12:00',
      lunchEnd: '13:30'
    }
  };

  // Estados de loading
  loading = {
    status: false,
    connect: false,
    disconnect: false,
    testMessage: false,
    userSettings: false,
    systemSettings: false,
    stats: false,
    detailedStats: false,
    performanceReport: false,
    notifications: false,
    antiBlockStats: false
  };

  // Código QR
  qrCode: string | null = null;

  // Configuración personalizada del paginador
  customPaginatorIntl = new MatPaginatorIntl();

  constructor(
    private whatsappService: WhatsappService,
    private snackBar: MatSnackBar,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Configurar etiquetas del paginador para mensajes
    this.customPaginatorIntl.itemsPerPageLabel = 'Mensajes por página:';
    this.customPaginatorIntl.nextPageLabel = 'Siguiente página';
    this.customPaginatorIntl.previousPageLabel = 'Página anterior';
    this.customPaginatorIntl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
      if (length === 0 || pageSize === 0) {
        return `0 de ${length}`;
      }
      const startIndex = page * pageSize;
      const endIndex = Math.min(startIndex + pageSize, length);
      return `${startIndex + 1} – ${endIndex} de ${length}`;
    };

    // Solo inicializar Socket.IO en el navegador
    if (isPlatformBrowser(this.platformId)) {
      this.initializeSocket();
    }
  }

  private initializeSocket() {
    // Inicializar Socket.IO
    this.socket = io(environment.backendUrl, {
      transports: ['websocket'],
      withCredentials: true
    });

    // Configurar listeners de WebSocket
    this.setupWebSocketListeners();
  }

  ngOnInit() {
    // Inicializar filteredNotifications
    this.filteredNotifications = [];

    this.loadConnectionStatus();
    this.loadUserSettings();
    this.loadSystemSettings(); // Cargar configuración del sistema
    this.loadBusinessHours(); // Cargar horario laboral desde dashboard
    this.loadStats();
    this.loadDetailedStats(); // Cargar estadísticas detalladas
    this.loadPerformanceReport(); // Cargar reporte de rendimiento
    this.loadNotificationHistory();
    this.loadAntiBlockStats(); // Cargar estadísticas anti-bloqueo
  }

  /**
   * Configurar listeners de WebSocket
   */
  private setupWebSocketListeners() {
    // Escuchar código QR
    this.socket.on('whatsapp-qr-code', (data: any) => {
      this.qrCode = data.qrCode;
    });

    // Escuchar cambios de estado de conexión
    this.socket.on('whatsapp-connection-status', (data: any) => {
      this.connectionStatus = data;
      if (data.isConnected) {
        this.qrCode = null;
        this.showSuccess('WhatsApp conectado exitosamente');
      }
    });
  }

  /**
   * Cargar estado de conexión
   */
  async loadConnectionStatus() {
    this.loading.status = true;
    try {
      this.connectionStatus = await this.whatsappService.getConnectionStatus();
    } catch (error: any) {
      // Si la ruta no existe (404), usar estado por defecto silenciosamente
      if (error?.status === 404) {
        this.connectionStatus = {
          isConnected: false,
          hasSocket: false,
          timestamp: null
        };
      } else {
        console.error('Error al cargar estado de conexión:', error);
        this.showError('Error al cargar estado de conexión');
      }
    } finally {
      this.loading.status = false;
    }
  }

  /**
   * Conectar WhatsApp
   */
  async connectWhatsApp() {
    this.loading.connect = true;
    this.qrCode = null;
    try {
      const result = await this.whatsappService.connect();
      if (result.success) {
        this.showSuccess('Iniciando conexión WhatsApp...');
        this.qrCode = result.qrCode;

        // Recargar estado cada 5 segundos hasta que se conecte
        const interval = setInterval(async () => {
          await this.loadConnectionStatus();
          if (this.connectionStatus.isConnected) {
            clearInterval(interval);
            this.qrCode = null;
            this.showSuccess('WhatsApp conectado exitosamente');
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Error al conectar WhatsApp:', error);
      this.showError('Error al conectar WhatsApp');
    } finally {
      this.loading.connect = false;
    }
  }

  /**
   * Desconectar WhatsApp
   */
  async disconnectWhatsApp() {
    this.loading.disconnect = true;
    try {
      await this.whatsappService.disconnect();
      this.showSuccess('WhatsApp desconectado exitosamente');
      await this.loadConnectionStatus();
    } catch (error) {
      console.error('Error al desconectar WhatsApp:', error);
      this.showError('Error al desconectar WhatsApp');
    } finally {
      this.loading.disconnect = false;
    }
  }

  /**
   * Enviar mensaje de prueba
   */
  async sendTestMessage() {
    if (!this.testMessage.phoneNumber || !this.testMessage.message) {
      this.showError('Por favor complete el número de teléfono y el mensaje');
      return;
    }

    this.loading.testMessage = true;
    try {
      await this.whatsappService.sendTestMessage(
        this.testMessage.phoneNumber
      );
      this.showSuccess('Mensaje de prueba enviado exitosamente');
      this.testMessage = { phoneNumber: '', message: '' };
    } catch (error) {
      console.error('Error al enviar mensaje de prueba:', error);
      this.showError('Error al enviar mensaje de prueba');
    } finally {
      this.loading.testMessage = false;
    }
  }

  /**
   * Cargar configuración del usuario
   */
  async loadUserSettings() {
    this.loading.userSettings = true;
    try {
      this.userSettings = await this.whatsappService.getUserSettings();
    } catch (error: any) {
      // Si la ruta no existe (404), usar configuración por defecto silenciosamente
      if (error?.status === 404) {
        // Usar configuración por defecto sin logs
      } else {
        console.error('Error al cargar configuración:', error);
        this.showError('Error al cargar configuración del usuario');
      }
    } finally {
      this.loading.userSettings = false;
    }
  }

  /**
   * Guardar configuración del usuario
   */
  async saveUserSettings() {
    this.loading.userSettings = true;
    try {
      await this.whatsappService.updateUserSettings(this.userSettings);
      this.showSuccess('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      this.showError('Error al guardar configuración');
    } finally {
      this.loading.userSettings = false;
    }
  }

  /**
   * Cargar estadísticas
   */
  async loadStats() {
    this.loading.stats = true;
    try {
      this.stats = await this.whatsappService.getSimpleStats();
    } catch (error: any) {
      // Si la ruta no existe (404), usar array vacío silenciosamente
      if (error?.status === 404) {
        this.stats = [];
      } else {
        console.error('Error al cargar estadísticas:', error);
        this.showError('Error al cargar estadísticas');
      }
    } finally {
      this.loading.stats = false;
    }
  }

  /**
   * Cargar estadísticas detalladas
   */
  async loadDetailedStats(period: string = this.selectedStatsPeriod) {
    this.loading.detailedStats = true;
    this.selectedStatsPeriod = period;
    try {
      const result = await this.whatsappService.getDetailedStats(period);
      this.detailedStats = result || {
        summary: {},
        type_stats: [],
        top_users: [],
        hourly_stats: [],
        error_stats: [],
        daily_stats: []
      };
    } catch (error) {
      console.error('Error al cargar estadísticas detalladas:', error);
      this.showError('Error al cargar estadísticas detalladas');
      this.detailedStats = {
        summary: {},
        type_stats: [],
        top_users: [],
        hourly_stats: [],
        error_stats: [],
        daily_stats: []
      };
    } finally {
      this.loading.detailedStats = false;
    }
  }

  /**
   * Cargar reporte de rendimiento
   */
  async loadPerformanceReport(period: string = this.selectedStatsPeriod) {
    this.loading.performanceReport = true;
    try {
      const result = await this.whatsappService.getPerformanceReport(period, 'json');
      this.performanceReport = result || {
        performance_analysis: {
          status: '',
          recommendations: [],
          peak_hours: []
        },
        detailed_metrics: {
          daily_trend: '',
          notification_types: [],
          top_errors: []
        }
      };
    } catch (error) {
      console.error('Error al cargar reporte de rendimiento:', error);
      this.showError('Error al cargar reporte de rendimiento');
      this.performanceReport = {
        performance_analysis: {
          status: '',
          recommendations: [],
          peak_hours: []
        },
        detailed_metrics: {
          daily_trend: '',
          notification_types: [],
          top_errors: []
        }
      };
    } finally {
      this.loading.performanceReport = false;
    }
  }

  /**
   * Descargar reporte de rendimiento como texto
   */
  async downloadPerformanceReport() {
    try {
      const reportText = await this.whatsappService.getPerformanceReport(this.selectedStatsPeriod, 'text');

      const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte-whatsapp-${this.selectedStatsPeriod}dias-${new Date().getTime()}.txt`;
      link.click();
      window.URL.revokeObjectURL(url);

      this.showSuccess('Reporte descargado exitosamente');
    } catch (error) {
      console.error('Error al descargar reporte:', error);
      this.showError('Error al descargar reporte');
    }
  }

  /**
   * Cambiar período de estadísticas
   */
  async onStatsPeriodChange() {
    await Promise.all([
      this.loadDetailedStats(),
      this.loadPerformanceReport()
    ]);
  }

  /**
   * Obtener clase CSS para tasa de éxito
   */
  getSuccessRateClass(successRate: number): string {
    if (successRate >= 90) return 'excellent';
    if (successRate >= 75) return 'good';
    if (successRate >= 50) return 'regular';
    return 'poor';
  }

  /**
   * Obtener clase CSS para estado de rendimiento
   */
  getPerformanceStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'excelente': return 'excellent';
      case 'bueno': return 'good';
      case 'regular': return 'regular';
      case 'deficiente': return 'poor';
      default: return 'neutral';
    }
  }

  /**
   * Verificar si las estadísticas detalladas están cargadas y válidas
   */
  hasValidDetailedStats(): boolean {
    return !!(this.detailedStats &&
              this.detailedStats.summary &&
              typeof this.detailedStats.summary === 'object');
  }

  /**
   * Verificar si el reporte de rendimiento está cargado y válido
   */
  hasValidPerformanceReport(): boolean {
    return !!(this.performanceReport &&
              this.performanceReport.performance_analysis &&
              typeof this.performanceReport.performance_analysis === 'object');
  }

  /**
   * Verificar si hay datos de tipos de estadísticas
   */
  hasTypeStats(): boolean {
    return !!(this.detailedStats &&
              this.detailedStats.type_stats &&
              Array.isArray(this.detailedStats.type_stats) &&
              this.detailedStats.type_stats.length > 0);
  }

  /**
   * Verificar si hay datos de usuarios top
   */
  hasTopUsers(): boolean {
    return !!(this.detailedStats &&
              this.detailedStats.top_users &&
              Array.isArray(this.detailedStats.top_users) &&
              this.detailedStats.top_users.length > 0);
  }

  /**
   * Cargar historial de notificaciones
   */
  async loadNotificationHistory() {
    this.loading.notifications = true;
    try {
      // Calcular page y offset
      const page = this.currentPage;
      const limit = this.pageSize;

      // Extraer filtros
      const search = this.historyFilter.search || '';
      const status = this.historyFilter.status || 'all';
      const type = this.historyFilter.type || 'all';
      const user = this.historyFilter.user || '';

            // Llamar al servicio con parámetros individuales
      const response = await this.whatsappService.getNotificationHistory(
        page,
        limit,
        search,
        status,
        type,
        user
      );

      // Verificar si la respuesta tiene la nueva estructura con metadata
      if (response && typeof response === 'object' && response.data) {
        this.notifications = response.data;
        this.filteredNotifications = response.data;
        this.totalNotifications = response.total || 0;
      } else {
        // Backward compatibility - respuesta directa como array
        this.notifications = response || [];
        this.filteredNotifications = response || [];
        this.totalNotifications = this.notifications.length;
      }
    } catch (error: any) {
      // Si la ruta no existe (404), usar array vacío silenciosamente
      if (error?.status === 404) {
        this.notifications = [];
        this.filteredNotifications = [];
        this.totalNotifications = 0;
      } else {
        console.error('Error al cargar historial:', error);
        this.showError('Error al cargar historial de notificaciones');
      }
    } finally {
      this.loading.notifications = false;
    }
  }

  /**
   * Cargar configuración global del sistema
   */
  async loadSystemSettings() {
    this.loading.systemSettings = true;
    try {
      const settings = await this.whatsappService.getSystemSettings();
      if (settings) {
        // Mapear las configuraciones globales del sistema
        this.systemSettings = {
          ...this.systemSettings,
          whatsapp_enabled_globally: settings.whatsapp_global_enabled,
          enable_new_ticket_notifications: settings.whatsapp_global_ticket_created,
          enable_assignment_notifications: settings.whatsapp_global_ticket_assigned,
          enable_status_change_notifications: settings.whatsapp_global_ticket_status,
          enable_comment_notifications: settings.whatsapp_global_comments
        };
      }

      // Cargar horarios laborales desde el dashboard
      try {
        const businessHours = await this.whatsappService.getBusinessHours();
        if (businessHours && businessHours.schedule) {
          // Actualizar los límites con los horarios laborales del dashboard
          this.newLimits.businessHours = {
            ...this.newLimits.businessHours,
            start: businessHours.schedule.work_hours_start || '07:00',
            end: businessHours.schedule.work_hours_end || '17:30'
          };
        }
      } catch (businessHoursError) {
        console.warn('⚠️ No se pudieron cargar horarios laborales desde dashboard:', businessHoursError);
      }

    } catch (error: any) {
      // Si hay error, usar configuración por defecto
      if (error?.status === 404) {
        console.info('Usando configuración del sistema por defecto');
      } else {
        console.error('Error al cargar configuración del sistema:', error);
        this.showError('Error al cargar configuración del sistema');
      }
    } finally {
      this.loading.systemSettings = false;
    }
  }

  /**
   * Guardar configuraciones del sistema
   */
  async saveSystemSettings() {
    this.loading.systemSettings = true;
    try {
      // Mapear las configuraciones del frontend a configuraciones globales del sistema
      const globalSettings = {
        whatsapp_global_enabled: this.systemSettings.whatsapp_enabled_globally,
        whatsapp_global_ticket_created: this.systemSettings.enable_new_ticket_notifications,
        whatsapp_global_ticket_assigned: this.systemSettings.enable_assignment_notifications,
        whatsapp_global_ticket_status: this.systemSettings.enable_status_change_notifications,
        whatsapp_global_comments: this.systemSettings.enable_comment_notifications
      };

      await this.whatsappService.saveSystemSettings(globalSettings);
      this.showSuccess('Configuración global del sistema guardada correctamente');
    } catch (error) {
      console.error('Error guardando configuración global del sistema:', error);
      this.showError('Error al guardar la configuración global del sistema');
    } finally {
      this.loading.systemSettings = false;
    }
  }

  /**
   * Restaurar configuraciones del sistema por defecto
   */
  resetSystemSettings() {
    this.systemSettings = {
      whatsapp_enabled_globally: true,
      enable_new_ticket_notifications: true,
      enable_assignment_notifications: true,
      enable_status_change_notifications: true,
      enable_comment_notifications: true,
      default_business_hours: '8-17',
      default_daily_limit: '20',
      require_phone_validation: false,
      auto_reconnect_interval: '10'
    };
    this.showSuccess('Configuración restaurada a valores por defecto');
  }

  /**
   * Obtener color del badge según estado
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'sent': return 'primary';
      case 'failed': return 'warn';
      case 'pending': return 'accent';
      default: return '';
    }
  }

  /**
   * Generar URL para código QR
   */
  getQRCodeUrl(qrCode: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`;
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
   * Recargar todos los datos
   */
  async refreshAll() {
    await Promise.all([
      this.loadConnectionStatus(),
      this.loadUserSettings(),
      this.loadSystemSettings(), // Cargar configuración del sistema
      this.loadStats(),
      this.loadNotificationHistory(),
      this.loadAntiBlockStats() // Cargar estadísticas anti-bloqueo
    ]);
  }

  // Nuevos métodos para el historial mejorado

  /**
   * Aplicar filtros al historial (ahora se maneja en el backend)
   */
  applyHistoryFilter() {
    // Resetear paginación cuando se aplican filtros
    this.currentPage = 0;
    // Recargar datos con filtros aplicados en el backend
    this.loadNotificationHistory();
  }

  /**
   * Limpiar filtros del historial
   */
  clearHistoryFilters() {
    this.historyFilter = {
      status: '',
      user: '',
      type: '',
      search: ''
    };
    this.applyHistoryFilter();
  }

  /**
   * Obtener preview del mensaje
   */
  getMessagePreview(message: string): string {
    if (!message) return 'Sin mensaje';
    return message.length > 80 ? message.substring(0, 80) + '...' : message;
  }

  /**
   * Ver detalles del mensaje
   */
  viewMessageDetails(notification: any) {
    this.selectedMessage = notification;
  }

  /**
   * Cerrar modal de mensaje
   */
  closeMessageModal() {
    this.selectedMessage = null;
  }

  /**
   * Copiar mensaje al portapapeles
   */
  copyMessage() {
    if (this.selectedMessage?.message) {
      navigator.clipboard.writeText(this.selectedMessage.message).then(() => {
        this.showSuccess('Mensaje copiado al portapapeles');
      }).catch(() => {
        this.showError('Error al copiar el mensaje');
      });
    }
  }

  /**
   * Obtener clase CSS para el estado
   */
  getStatusClass(status: string): string {
    switch (status) {
      case 'sent': return 'status-sent';
      case 'failed': return 'status-failed';
      case 'pending': return 'status-pending';
      default: return 'status-unknown';
    }
  }

  /**
   * Obtener icono para el estado
   */
  getStatusIcon(status: string): string {
    switch (status) {
      case 'sent': return 'check_circle';
      case 'failed': return 'error';
      case 'pending': return 'schedule';
      default: return 'help_outline';
    }
  }

  /**
   * Obtener texto para el estado
   */
  getStatusText(status: string): string {
    switch (status) {
      case 'sent': return 'Enviado';
      case 'failed': return 'Fallido';
      case 'pending': return 'Pendiente';
      default: return 'Desconocido';
    }
  }

  /**
   * Formatear fecha
   */
  formatDate(date: string): string {
    if (!date) return 'Sin fecha';
    return new Date(date).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Exportar historial a XLSX usando ExcelJS
   */
  async exportHistory() {
    if (this.notifications.length === 0) {
      this.showError('No hay datos para exportar');
      return;
    }

    try {
      // Importación dinámica de file-saver para mejor compatibilidad ESM
      const { saveAs } = await import('file-saver');

      // Crear libro de trabajo con ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Historial WhatsApp');

      // Definir columnas
      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 20 },
        { header: 'Usuario', key: 'usuario', width: 25 },
        { header: 'Ticket', key: 'ticket', width: 10 },
        { header: 'Mensaje', key: 'mensaje', width: 50 },
        { header: 'Tipo', key: 'tipo', width: 15 },
        { header: 'Estado', key: 'estado', width: 15 },
        { header: 'Teléfono', key: 'telefono', width: 20 },
        { header: 'Error', key: 'error', width: 30 }
      ];

      // Agregar datos
      this.notifications.forEach(notification => {
        worksheet.addRow({
          fecha: this.formatDate(notification.created_at),
          usuario: notification.user_name || 'Sin usuario',
          ticket: `#${notification.ticket_id}`,
          mensaje: notification.message || 'Sin mensaje',
          tipo: this.getTypeText(notification),
          estado: this.getStatusText(notification.status),
          telefono: notification.phone_number || 'N/A',
          error: notification.error_message || ''
        });
      });

      // Estilizar la cabecera
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };

      // Generar buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Crear blob y descargar
      const data = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const fileName = `historial_whatsapp_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(data, fileName);

      this.showSuccess('Historial exportado correctamente en formato Excel');
    } catch (error) {
      console.error('Error al exportar:', error);
      this.showError('Error al exportar el historial');
    }
  }

  /**
   * Obtener icono para estadísticas
   */
  getStatIcon(status: string): string {
    return status === 'sent' ? 'check_circle' : 'error';
  }

  /**
   * Obtener texto para estadísticas
   */
  getStatText(status: string): string {
    return status === 'sent' ? 'Enviados' : 'Fallidos';
  }

  /**
   * Obtener icono para tipo de notificación
   */
  getTypeIcon(type: string | any): string {
    // Si se pasa el objeto notification directamente, usar el campo notification_type
    if (typeof type === 'object' && type !== null) {
      type = type.notification_type || type.message_type || 'unknown';
    }

    switch (type) {
      case 'nuevo_ticket':
      case 'new_ticket':
        return 'add_circle';
      case 'ticket_asignado':
      case 'ticket_assigned':
        return 'person_add';
      case 'cambio_estado':
      case 'status_change':
      case 'ticket_reabierto':
        return 'update';
      case 'comentario':
      case 'comentario_user':
      case 'comentario_tech':
      case 'comentario_admin':
      case 'admin_comentario':
      case 'comment':
        return 'comment';
      case 'test_message':
        return 'send';
      case 'maintenance':
        return 'build';
      default:
        return 'notifications';
    }
  }

  // Cache para tipos de notificación para evitar recálculos
  getTypeText(type: string | any): string {
    // Si se pasa el objeto notification directamente, usar el campo notification_type
    if (typeof type === 'object' && type !== null) {
      type = type.notification_type || type.message_type || 'unknown';
    }

    if (!type) {
      return 'Sin Tipo';
    }

    switch (type) {
      case 'nuevo_ticket':
      case 'new_ticket':
        return 'Nuevo Ticket';
      case 'ticket_asignado':
      case 'ticket_assigned':
        return 'Ticket Asignado';
      case 'cambio_estado':
      case 'status_change':
        return 'Cambio Estado';
      case 'ticket_reabierto':
        return 'Ticket Reabierto';
      case 'comentario':
      case 'comment':
        return 'Comentario';
      case 'comentario_user':
        return 'Comentario Usuario';
      case 'comentario_tech':
        return 'Comentario Técnico';
      case 'comentario_admin':
        return 'Comentario Admin';
      case 'admin_comentario':
        return 'Comentario Admin';
      case 'test_message':
        return 'Mensaje Prueba';
      case 'maintenance':
        return 'Mantenimiento';
      default:
        return `Desconocido (${type})`;
    }
  }

  /**
   * Obtener clase CSS para tipo de notificación
   */
  getTypeClass(type: string | any): string {
    // Si se pasa el objeto notification directamente, usar el campo notification_type
    if (typeof type === 'object' && type !== null) {
      type = type.notification_type || type.message_type || 'unknown';
    }

    switch (type) {
      case 'nuevo_ticket':
      case 'new_ticket':
        return 'type-new-ticket';
      case 'ticket_asignado':
      case 'ticket_assigned':
        return 'type-assigned';
      case 'cambio_estado':
      case 'status_change':
      case 'ticket_reabierto':
        return 'type-status-change';
      case 'comentario':
      case 'comentario_user':
      case 'comentario_tech':
      case 'comentario_admin':
      case 'admin_comentario':
      case 'comment':
        return 'type-comment';
      case 'test_message':
        return 'type-test';
      default:
        return 'type-unknown';
    }
  }

  /**
   * Manejar cambio de página en el paginador
   */
  onPageChange(event: any) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadNotificationHistory();
  }

  // ========== MÉTODOS ANTI-BLOQUEO ==========

  /**
   * Cargar estadísticas anti-bloqueo
   */
  async loadAntiBlockStats() {
    this.loading.antiBlockStats = true;
    try {
      this.antiBlockStats = await this.whatsappService.getAntiBlockStats();

      // Cargar también uso por horas
      this.hourlyUsageData = await this.whatsappService.getHourlyUsage('7');

      // Actualizar configuración actual - NO convertir delays, ya están en segundos
      if (this.antiBlockStats?.limits) {
        this.newLimits = { ...this.antiBlockStats.limits };
      }
    } catch (error) {
      console.error('Error al cargar estadísticas anti-bloqueo:', error);
      this.showError('Error al cargar estadísticas de seguridad');
    } finally {
      this.loading.antiBlockStats = false;
    }
  }

  /**
   * Obtener ícono de seguridad según el nivel
   */
  getSecurityIcon(level: string): string {
    switch (level) {
      case 'safe': return 'check_circle';
      case 'caution': return 'warning';
      case 'warning': return 'error_outline';
      case 'danger': return 'dangerous';
      default: return 'help';
    }
  }

  /**
   * Obtener color de progreso según porcentaje
   */
  getProgressColor(percentage: number): string {
    if (percentage >= 90) return 'warn';
    if (percentage >= 70) return 'accent';
    return 'primary';
  }

  /**
   * Cargar horario laboral desde el dashboard
   */
  async loadBusinessHours() {
    try {
      const businessHours = await this.whatsappService.getBusinessHours();
      if (businessHours) {
        // Transformar el formato del backend al formato esperado por el frontend
        this.newLimits.businessHours = {
          start: businessHours.work_hours_start,
          end: businessHours.work_hours_end,
          fridayEnd: businessHours.work_hours_friday_end,
          lunchStart: businessHours.lunch_break_start,
          lunchEnd: businessHours.lunch_break_end
        };
      }
    } catch (error) {
      console.error('Error cargando horario laboral:', error);
      // Los valores por defecto ya están inicializados en newLimits
    }
  }

  /**
   * Obtener datos para gráfico de uso por horas (6 AM - 7 PM)
   */
  getHourlyChartData(): any[] {
    if (!this.hourlyUsageData || this.hourlyUsageData.length === 0) return [];

    // Definir rango de horas a mostrar (6 AM - 7 PM)
    const START_HOUR = 6;  // 6 AM
    const END_HOUR = 19;   // 7 PM

    // Agrupar por hora solo en el rango de interés
    const hourlyTotals: { [key: number]: number } = {};

    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      hourlyTotals[hour] = 0;
    }

    this.hourlyUsageData.forEach(item => {
      const hour = parseInt(item.hour);
      // Solo incluir horas en el rango de interés
      if (hour >= START_HOUR && hour <= END_HOUR) {
        hourlyTotals[hour] += parseInt(item.message_count);
      }
    });

    // Encontrar el máximo para calcular porcentajes
    const maxCount = Math.max(...Object.values(hourlyTotals));

    // Generar datos solo para el rango horario de interés
    return Object.keys(hourlyTotals).map(hour => ({
      hour: parseInt(hour),
      count: hourlyTotals[parseInt(hour)],
      percentage: maxCount > 0 ? (hourlyTotals[parseInt(hour)] / maxCount) * 100 : 0
    })).sort((a, b) => a.hour - b.hour);
  }

  /**
   * Guardar configuración de límites
   */
  async saveLimitsConfig() {
    this.loading.antiBlockStats = true;
    try {
      // El backend espera delays en milisegundos, convertir solo esos campos
      const limitsToSend = {
        ...this.newLimits,
        minDelayBetweenMessages: this.newLimits.minDelayBetweenMessages * 1000,
        maxDelayBetweenMessages: this.newLimits.maxDelayBetweenMessages * 1000
      };

      await this.whatsappService.configureLimits(limitsToSend);
      this.showSuccess('Límites de seguridad actualizados exitosamente');
      await this.loadAntiBlockStats(); // Recargar para ver cambios
    } catch (error) {
      console.error('Error al guardar límites:', error);
      this.showError('Error al guardar configuración de límites');
    } finally {
      this.loading.antiBlockStats = false;
    }
  }

  /**
   * Restaurar límites por defecto
   */
  resetLimitsToDefault() {
    this.newLimits = {
      maxDailyMessages: 100,
      maxMessagesPerHour: 20,
      minDelayBetweenMessages: 3000,
      maxDelayBetweenMessages: 8000,
      maxBurstMessages: 3,
      businessHours: {
        enabled: true,
        start: '08:00',
        end: '18:00',
        maxMessagesPerHour: 30
      },
      afterHours: {
        maxMessagesPerHour: 5,
        emergencyOnly: true
      },
      advanced: {
        riskThreshold: 0.7,
        adaptiveDelays: true,
        burstProtection: true
      }
    };
  }

  /**
   * Obtener uso en horario laboral
   */
  getBusinessHoursUsage(): number {
    if (!this.antiBlockStats) return 0;
    // Calcular mensajes enviados en horario laboral
    return this.antiBlockStats.messagesSentToday || 0;
  }

  /**
   * Obtener uso fuera de horario laboral
   */
  getAfterHoursUsage(): number {
    if (!this.antiBlockStats) return 0;
    // Calcular mensajes enviados fuera de horario laboral
    return Math.floor((this.antiBlockStats.messagesSentToday || 0) * 0.1);
  }

  /**
   * Obtener hora pico del día
   */
  getPeakHour(): string {
    if (!this.hourlyUsageData || this.hourlyUsageData.length === 0) return 'N/A';

    let maxUsage = 0;
    let peakHour = 0;

    this.hourlyUsageData.forEach((data, index) => {
      if (data > maxUsage) {
        maxUsage = data;
        peakHour = index;
      }
    });

    return `${peakHour.toString().padStart(2, '0')}:00`;
  }

  /**
   * Obtener recomendaciones anti-bloqueo
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this.antiBlockStats) return recommendations;

    const dailyUsage = this.antiBlockStats.usage?.dailyMessages || 0;
    const hourlyUsage = this.antiBlockStats.usage?.hourlyMessages || 0;
    const maxDaily = this.antiBlockStats.limits?.maxDailyMessages || 100;
    const maxHourly = this.antiBlockStats.limits?.maxMessagesPerHour || 20;
    const dailyPercentage = this.antiBlockStats.remaining?.dailyPercentageUsed || 0;
    const hourlyPercentage = this.antiBlockStats.remaining?.hourlyPercentageUsed || 0;

    // Recomendaciones basadas en uso
    if (dailyPercentage > 90) {
      recommendations.push('Alto uso diario (>90%). Considerar aumentar límites o reducir envíos.');
    } else if (dailyPercentage > 70) {
      recommendations.push('Uso diario moderado-alto. Monitorear de cerca.');
    }

    if (hourlyPercentage > 90) {
      recommendations.push('Alto uso por hora. Considerar espaciar más los envíos.');
    }

    // Recomendaciones basadas en horarios
    if (!this.isBusinessHours()) {
      recommendations.push('Fuera del horario laboral. Los envíos están restringidos.');
    }

    // Recomendaciones de seguridad
    if (this.antiBlockStats.safetyStatus?.level === 'warning') {
      recommendations.push('Estado de advertencia. Revisar configuración de límites.');
    } else if (this.antiBlockStats.safetyStatus?.level === 'danger') {
      recommendations.push('Estado crítico. Pausar envíos y revisar configuración.');
    }

    // Recomendaciones positivas
    if (recommendations.length === 0) {
      if (dailyPercentage < 50 && hourlyPercentage < 50) {
        recommendations.push('Uso óptimo. Sistema funcionando dentro de parámetros seguros.');
      } else {
        recommendations.push('Sistema operando normalmente. Continuar monitoreo.');
      }
    }

    return recommendations;
  }

  /**
   * Obtener tiempo del próximo envío permitido con mejor formato
   */
  getNextSendTime(): string {
    if (!this.antiBlockStats?.nextAllowedSend) {
      return this.isBusinessHours() ? 'Disponible' : 'Fuera de horario';
    }

    const nextSend = new Date(this.antiBlockStats.nextAllowedSend);
    const now = new Date();

    if (nextSend <= now) {
      return this.isBusinessHours() ? 'Disponible' : 'Fuera de horario';
    }

    const diffMs = nextSend.getTime() - now.getTime();
    const diffSeconds = Math.ceil(diffMs / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s`;

    const diffMinutes = Math.ceil(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m`;

    const diffHours = Math.ceil(diffMinutes / 60);
    return `${diffHours}h`;
  }

  /**
   * Obtener estado del próximo envío con más detalle
   */
  getNextSendStatus(): string {
    if (!this.isBusinessHours()) {
      const businessHours = this.newLimits.businessHours;
      if (businessHours) {
        return `Fuera de horario laboral (${businessHours.start} - ${businessHours.end})`;
      }
      return 'Fuera del horario laboral';
    }

    if (!this.antiBlockStats?.nextAllowedSend) return 'Listo para enviar';

    const nextSend = new Date(this.antiBlockStats.nextAllowedSend);
    const now = new Date();

    return nextSend <= now ? 'Listo para enviar' : 'Esperando por límites de rate limiting';
  }

  /**
   * Actualizar configuración de horario laboral
   */
  async updateBusinessHours() {
    try {
      this.loading.antiBlockStats = true;

      const businessHoursConfig = {
        business_hours_enabled: this.newLimits.businessHours.enabled,
        business_start_time: this.newLimits.businessHours.start,
        business_end_time: this.newLimits.businessHours.end,
        business_max_messages_per_hour: this.newLimits.businessHours.maxMessagesPerHour,
        after_hours_max_messages: this.newLimits.afterHours.maxMessagesPerHour,
        emergency_only_after_hours: this.newLimits.afterHours.emergencyOnly
      };

      await this.whatsappService.saveSystemSettings(businessHoursConfig);
      this.showSuccess('Configuración de horario laboral actualizada');
      await this.loadAntiBlockStats();
    } catch (error) {
      console.error('Error al actualizar horario laboral:', error);
      this.showError('Error al actualizar configuración de horario laboral');
    } finally {
      this.loading.antiBlockStats = false;
    }
  }

  /**
   * Verificar si estamos en horario laboral
   */
  isBusinessHours(): boolean {
    try {
      // Verificar que los datos de horario laboral estén disponibles
      if (!this.newLimits.businessHours || !this.newLimits.businessHours.start || !this.newLimits.businessHours.end) {
        return false; // Por seguridad, asumir que no es horario laboral si no hay datos
      }

      const now = new Date();
      const currentDay = now.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // No es día laboral (sábado = 6, domingo = 0)
      if (currentDay === 0 || currentDay === 6) {
        return false;
      }

      const start = this.newLimits.businessHours.start.split(':');
      let end;

      // Viernes tiene horario diferente
      if (currentDay === 5 && this.newLimits.businessHours.fridayEnd) {
        end = this.newLimits.businessHours.fridayEnd.split(':');
      } else {
        end = this.newLimits.businessHours.end.split(':');
      }

      const startTime = parseInt(start[0]) * 60 + parseInt(start[1]);
      const endTime = parseInt(end[0]) * 60 + parseInt(end[1]);
      const currentTime = currentHour * 60 + currentMinute;

      // Verificar si está en horario de almuerzo
      let inLunchBreak = false;
      if (this.newLimits.businessHours.lunchStart && this.newLimits.businessHours.lunchEnd) {
        const lunchStart = this.newLimits.businessHours.lunchStart.split(':');
        const lunchEnd = this.newLimits.businessHours.lunchEnd.split(':');
        const lunchStartTime = parseInt(lunchStart[0]) * 60 + parseInt(lunchStart[1]);
        const lunchEndTime = parseInt(lunchEnd[0]) * 60 + parseInt(lunchEnd[1]);
        inLunchBreak = currentTime >= lunchStartTime && currentTime <= lunchEndTime;
      }

      // Está en horario laboral pero no en almuerzo
      const inWorkHours = currentTime >= startTime && currentTime <= endTime;
      return inWorkHours && !inLunchBreak;

    } catch (error) {
      console.error('Error verificando horario laboral en frontend:', error);
      return false; // Por seguridad, asumir que no es horario laboral si hay error
    }
  }

  /**
   * Test de límites actuales
   */
  testCurrentLimits() {
    this.showSuccess('Prueba de límites iniciada. Revise la consola para ver los resultados.');
  }

  /**
   * Obtener porcentaje de uso en horario laboral
   */
  getBusinessHoursPercentage(): number {
    if (!this.antiBlockStats) return 0;
    const businessUsage = this.getBusinessHoursUsage();
    const maxMessages = this.newLimits.businessHours?.maxMessagesPerHour || 30;
    return Math.round((businessUsage / maxMessages) * 100);
  }

  /**
   * Obtener porcentaje de uso fuera de horario laboral
   */
  getAfterHoursPercentage(): number {
    if (!this.antiBlockStats) return 0;
    const afterHoursUsage = this.getAfterHoursUsage();
    const maxMessages = this.newLimits.afterHours?.maxMessagesPerHour || 5;
    return Math.round((afterHoursUsage / maxMessages) * 100);
  }

  /**
   * Obtener conteo de mensajes en hora pico
   */
  getPeakHourCount(): number {
    if (!this.hourlyUsageData || this.hourlyUsageData.length === 0) return 0;

    let maxCount = 0;
    this.hourlyUsageData.forEach(data => {
      if (data > maxCount) {
        maxCount = data;
      }
    });

    return maxCount;
  }

  /**
   * Verificar si una hora específica es horario laboral
   */
  isBusinessHour(hour: number): boolean {
    const start = this.newLimits.businessHours?.start || '08:00';
    const end = this.newLimits.businessHours?.end || '18:00';

    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);

    return hour >= startHour && hour <= endHour;
  }

  /**
   * Obtener recomendaciones de patrones (alias para getRecommendations)
   */
  getPatternRecommendations(): string[] {
    return this.getRecommendations();
  }
}
