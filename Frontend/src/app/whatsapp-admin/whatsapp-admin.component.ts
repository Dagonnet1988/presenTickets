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
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, MatPaginatorIntl } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WhatsAppService } from '../shared/services/whatsapp.service';
import { AuthService } from '../shared/services/auth.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import * as ExcelJS from 'exceljs';

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
    type: ''
  };

  // Modal de mensaje completo
  selectedMessage: any = null;

  // Plantillas de mensajes
  templates: any = {
    new_ticket: '🆕 *PresenTickets* - Nuevo Ticket\n\nHola {userName},\n\nSe ha creado un nuevo ticket #{ticketId}\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
    ticket_assigned: '👤 *PresenTickets* - Ticket Asignado\n\nHola {userName},\n\nSe le ha asignado el ticket #{ticketId}\n📝 Asunto: {subject}\n\nPor favor revise y atienda este ticket.\n\n🕒 {timestamp}',
    status_change: '🔄 *PresenTickets* - Cambio de Estado\n\nHola {userName},\n\nEl ticket #{ticketId} cambió a: *{newStatus}*\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
    comment: '💬 *PresenTickets* - Nuevo Comentario\n\nHola {userName},\n\nNuevo comentario en el ticket #{ticketId}\n📝 Asunto: {subject}\n\n💭 Comentario: {comment}\n\n🕒 {timestamp}'
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
    notifications: false,
    templates: false
  };

  // Código QR
  qrCode: string | null = null;

  // Configuración personalizada del paginador
  customPaginatorIntl = new MatPaginatorIntl();

  constructor(
    private whatsappService: WhatsAppService,
    private snackBar: MatSnackBar,
    private authService: AuthService
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
    this.loadSystemSettings(); // Restaurar la carga de configuración del sistema
    this.loadStats();
    this.loadNotificationHistory();
    this.loadTemplates(); // Cargar plantillas
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
        this.testMessage.phoneNumber,
        this.testMessage.message
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
      this.stats = await this.whatsappService.getStats();
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
   * Cargar historial de notificaciones
   */
  async loadNotificationHistory() {
    this.loading.notifications = true;
    try {
      // Pasar parámetros de paginación al backend (convertir page/size a limit/offset)
      const params: any = {
        limit: this.pageSize,
        offset: this.currentPage * this.pageSize
      };

      // Agregar filtros si están definidos
      if (this.historyFilter.status) {
        params.status = this.historyFilter.status;
      }
      if (this.historyFilter.user) {
        params.user = this.historyFilter.user;
      }
      if (this.historyFilter.type) {
        params.type = this.historyFilter.type;
      }

      // Ahora todos los filtros se aplican en el backend
      const response = await this.whatsappService.getNotificationHistory(params);

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
   * Cargar configuración global del sistema (usa configuración del admin)
   */
  async loadSystemSettings() {
    this.loading.systemSettings = true;
    try {
      const settings = await this.whatsappService.getSystemSettings();
      if (settings) {
        // Mapear las configuraciones del usuario a configuraciones del sistema
        this.systemSettings = {
          ...this.systemSettings,
          whatsapp_enabled_globally: settings.whatsapp_enabled,
          enable_new_ticket_notifications: settings.whatsapp_ticket_created,
          enable_assignment_notifications: settings.whatsapp_ticket_assigned,
          enable_status_change_notifications: settings.whatsapp_ticket_status,
          enable_comment_notifications: settings.whatsapp_comments
        };
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
      // Mapear las configuraciones del sistema a configuraciones del usuario
      const userSettings = {
        whatsapp_enabled: this.systemSettings.whatsapp_enabled_globally,
        whatsapp_ticket_created: this.systemSettings.enable_new_ticket_notifications,
        whatsapp_ticket_assigned: this.systemSettings.enable_assignment_notifications,
        whatsapp_ticket_status: this.systemSettings.enable_status_change_notifications,
        whatsapp_comments: this.systemSettings.enable_comment_notifications
      };

      await this.whatsappService.saveSystemSettings(userSettings);
      this.showSuccess('Configuración del sistema guardada correctamente');
    } catch (error) {
      console.error('Error guardando configuración del sistema:', error);
      this.showError('Error al guardar la configuración del sistema');
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
      default_business_hours: '8-17',
      default_daily_limit: '20',
      template_new_ticket: '🆕 *PresenTickets* - Nuevo Ticket\n\nHola {userName},\n\nSe ha creado un nuevo ticket #{ticketId}\nAsunto: {subject}\n\n🕒 {timestamp}',
      template_assignment: '👤 *PresenTickets* - Ticket Asignado\n\nHola {userName},\n\nSe le ha asignado el ticket #{ticketId}\nAsunto: {subject}\n\n🕒 {timestamp}',
      template_status_change: '🔄 *PresenTickets* - Cambio de Estado\n\nHola {userName},\n\nEl ticket #{ticketId} cambió a: {newStatus}\nAsunto: {subject}\n\n🕒 {timestamp}',
      require_phone_validation: false,
      auto_reconnect_interval: '10'
    };
    this.showSuccess('Configuración restaurada a valores por defecto');
  }

  /**
   * Cargar plantillas de mensajes
   */
  async loadTemplates() {
    this.loading.templates = true;
    try {
      // Verificar que el usuario tenga rol de administrador
      const userRole = this.authService.getUserRole();
      if (userRole !== 'admin') {
        console.warn('Usuario sin permisos de administrador:', userRole);
        this.showError('Acceso denegado. Se requiere rol de administrador.');
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No hay token de autenticación');
        this.showError('No hay sesión activa. Por favor, inicie sesión nuevamente.');
        return;
      }

      const templates = await this.whatsappService.getTemplates();
      if (templates) {
        this.templates = { ...this.templates, ...templates };
      }
    } catch (error: any) {
      // Si hay error, usar plantillas por defecto
      if (error?.status === 404) {
        console.info('Usando plantillas por defecto');
      } else if (error?.status === 403) {
        console.warn('Acceso denegado al endpoint de plantillas');
        this.showError('Acceso denegado. Verificar permisos de administrador.');
      } else if (error?.status === 401) {
        console.warn('Token de autenticación inválido');
        this.showError('Sesión expirada. Por favor, inicie sesión nuevamente.');
      } else {
        console.error('Error al cargar plantillas:', error);
        this.showError('Error al cargar plantillas de mensajes');
      }
    } finally {
      this.loading.templates = false;
    }
  }

  /**
   * Guardar plantillas de mensajes
   */
  async saveTemplates() {
    this.loading.templates = true;
    try {
      // Verificar que el usuario tenga rol de administrador
      const userRole = this.authService.getUserRole();
      if (userRole !== 'admin') {
        console.warn('Usuario sin permisos de administrador:', userRole);
        this.showError('Acceso denegado. Se requiere rol de administrador.');
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No hay token de autenticación');
        this.showError('No hay sesión activa. Por favor, inicie sesión nuevamente.');
        return;
      }

      await this.whatsappService.saveTemplates(this.templates);
      this.showSuccess('Plantillas guardadas correctamente');
    } catch (error: any) {
      if (error?.status === 403) {
        console.warn('Acceso denegado al endpoint de plantillas');
        this.showError('Acceso denegado. Verificar permisos de administrador.');
      } else if (error?.status === 401) {
        console.warn('Token de autenticación inválido');
        this.showError('Sesión expirada. Por favor, inicie sesión nuevamente.');
      } else {
        console.error('Error guardando plantillas:', error);
        this.showError('Error al guardar las plantillas');
      }
    } finally {
      this.loading.templates = false;
    }
  }

  /**
   * Restaurar plantillas por defecto
   */
  resetTemplates() {
    this.templates = {
      new_ticket: '🆕 *PresenTickets* - Nuevo Ticket\n\nHola {userName},\n\nSe ha creado un nuevo ticket #{ticketId}\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
      ticket_assigned: '👤 *PresenTickets* - Ticket Asignado\n\nHola {userName},\n\nSe le ha asignado el ticket #{ticketId}\n📝 Asunto: {subject}\n\nPor favor revise y atienda este ticket.\n\n🕒 {timestamp}',
      status_change: '🔄 *PresenTickets* - Cambio de Estado\n\nHola {userName},\n\nEl ticket #{ticketId} cambió a: *{newStatus}*\n📝 Asunto: {subject}\n\n🕒 {timestamp}',
      comment: '💬 *PresenTickets* - Nuevo Comentario\n\nHola {userName},\n\nNuevo comentario en el ticket #{ticketId}\n📝 Asunto: {subject}\n\n💭 Comentario: {comment}\n\n🕒 {timestamp}'
    };
    this.showSuccess('Plantillas restauradas a valores por defecto');
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
      this.loadSystemSettings(), // Restaurar la carga de configuración del sistema
      this.loadStats(),
      this.loadNotificationHistory(),
      this.loadTemplates() // Cargar plantillas
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
      type: ''
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
      case 'new_ticket':
        return 'add_circle';
      case 'ticket_assigned':
        return 'person';
      case 'status_change':
        return 'update';
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
      case 'new_ticket':
        return 'Nuevo Ticket';
      case 'ticket_assigned':
        return 'Asignación';
      case 'status_change':
        return 'Cambio Estado';
      case 'comment':
        return 'Comentario';
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
      case 'new_ticket':
        return 'type-new-ticket';
      case 'ticket_assigned':
        return 'type-assigned';
      case 'status_change':
        return 'type-status-change';
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
}
