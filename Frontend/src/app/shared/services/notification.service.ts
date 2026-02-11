/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, isDevMode, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { RefreshTicketsService } from './refresh-tickets.service';

export interface TicketNotification {
  id?: number;
  ticket_id?: number;
  external_ticket_id?: string;
  email_subject?: string;
  type: string;
  data: any;
  read?: boolean;
  is_read?: boolean; // Campo del backend
  timestamp?: Date;
  created_at?: Date; // Campo del backend para fecha de creación
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  // Estado de mantenimiento en tiempo real
  private maintenanceSubject = new BehaviorSubject<{ active: boolean; message?: string; countdown?: number }>({ active: false });
  maintenance$ = this.maintenanceSubject.asObservable();
  private socket!: Socket;
  private notificationsSubject = new BehaviorSubject<TicketNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  constructor(
    private ngZone: NgZone,
    private authService: AuthService,
    private http: HttpClient,
    private refreshTicketsService: RefreshTicketsService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Solo inicializar Socket.IO en el navegador, no en SSR
    if (isPlatformBrowser(this.platformId)) {
      this.initializeSocket();
      // Cargar notificaciones inmediatamente si ya hay token
      this.initializeNotifications();
    }
  }

  private initializeNotifications() {
    // Intentar cargar notificaciones si el usuario ya está autenticado
    const token = localStorage.getItem('token');
    const userId = this.authService.getUserId();

    if (token && userId) {
      // Cargar notificaciones inmediatamente
      this.fetchUnreadNotifications();
    }
  }

  private initializeSocket() {
    this.socket = io(environment.backendUrl, {
      transports: ['websocket'],
      withCredentials: true
    });

    this.socket.on('connect', () => {
      const userId = this.authService.getUserId();
      if (userId) {
        this.socket.emit('register', String(userId));
        this.fetchUnreadNotifications();
        this.checkMaintenanceStatus();
      }
    });

    this.socket.on('disconnect', () => {
      // Manejador de desconexión
    });

    // Listener para eventos de mantenimiento
    this.socket.on('maintenance-countdown', (data: { message: string; countdownSeconds: number }) => {
      this.ngZone.run(() => {
        this.maintenanceSubject.next({
          active: false,
          message: data.message,
          countdown: data.countdownSeconds
        });
      });
    });

    this.socket.on('maintenance-start', () => {
      this.ngZone.run(() => {
        this.maintenanceSubject.next({
          active: true
        });
      });
    });

    this.socket.on('maintenance-ended', () => {
      this.ngZone.run(() => {
        this.maintenanceSubject.next({
          active: false,
          countdown: 0
        });
        this.checkMaintenanceStatus();
      });
    });

    this.socket.on('ticket-updated', (data: any) => {
      this.ngZone.run(() => {
        this.refreshTicketsService.triggerRefresh();
        const currentTicketId = this.getCurrentTicketIdFromUrl();
        if (currentTicketId === data.ticketId) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
          }, 100);
        }
      });
    });

    this.socket.on('ticket-notification', (notification: TicketNotification) => {
      this.ngZone.run(() => {
        const current = this.notificationsSubject.value;
        const currentTicketId = this.getCurrentTicketIdFromUrl();

        // Extraer ticketId correctamente del objeto de notificación en tiempo real
        const notificationTicketId = notification.data?.ticketId || notification.ticket_id;

        if (currentTicketId === notificationTicketId) {
          if (notification.id) {
            this.markSingleNotificationAsRead(notification.id.toString()).subscribe({
              error: (error) => console.error('Error marcando notificación como leída:', error)
            });
          }
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
          }, 100);
        } else {
          // Adaptar la notificación en tiempo real al formato esperado
          const adaptedNotification: TicketNotification = {
            id: notification.id,
            ticket_id: notificationTicketId,
            external_ticket_id: notification.data?.external_ticket_id,
            type: notification.type,
            message: notification.message,
            data: notification.data,
            timestamp: new Date(),
            read: false
          };

          const newNotifications = [...current, adaptedNotification];
          this.notificationsSubject.next(newNotifications);
        }

        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const ticketId = notification.data?.ticketId || notification.ticket_id;
            const externalTicketId = notification.data?.external_ticket_id || notification.external_ticket_id;
            new Notification(`Nuevo comentario en Ticket #${externalTicketId || ticketId}`, {
              body: notification.message,
              icon: '/favicon.ico',
              tag: `ticket-${ticketId}`,
              badge: '/favicon.ico'
            });
          } catch (error) {
            console.error('Error mostrando notificación del navegador:', error);
          }
        }

        setTimeout(() => this.fetchUnreadNotifications(), 500);
      });
    });

    // Listener para alertas de email externo (respuestas de soporte OSIGU)
    this.socket.on('external-email-alert', (data: any) => {
      this.ngZone.run(() => {
        // Mostrar notificación del navegador si está en segundo plano
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const title = data.externalTicketId
              ? `📧 Respuesta de Soporte - Ticket #${data.externalTicketId}`
              : '📧 Correo de Soporte Externo';
            new Notification(title, {
              body: data.subject?.substring(0, 100) || 'Nuevo correo recibido',
              icon: '/favicon.ico',
              tag: `email-${data.externalTicketId || Date.now()}`,
              badge: '/favicon.ico'
            });
          } catch (error) {
            console.error('Error mostrando notificación de email:', error);
          }
        }

        // Actualizar lista de notificaciones
        setTimeout(() => this.fetchUnreadNotifications(), 500);
      });
    });

    // Listener para notificaciones compartidas marcadas como leídas por otro técnico
    this.socket.on('shared-notification-read', (data: { externalTicketId: string; markedBy: number }) => {
      this.ngZone.run(() => {
        console.log(`📧 Notificación compartida del ticket #${data.externalTicketId} marcada como leída por otro técnico`);
        // Refrescar notificaciones para quitar las que ya fueron leídas
        this.fetchUnreadNotifications();
      });
    });
  }

  private getCurrentTicketIdFromUrl(): number | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const urlMatch = window.location.pathname.match(/\/ticket\/(\d+)/);
    return urlMatch ? parseInt(urlMatch[1], 10) : null;
  }

  getNotifications(): TicketNotification[] {
    return this.notificationsSubject.value;
  }

  // Método público para forzar la carga inicial de notificaciones
  initializeNotificationsForUser() {
    if (isPlatformBrowser(this.platformId)) {
      this.fetchUnreadNotifications();
    }
  }

  fetchUnreadNotifications() {
    if (!isPlatformBrowser(this.platformId)) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    this.http.get<any[]>(`${environment.backendUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (notifications) => {
        // Transformar is_read a read para compatibilidad con el frontend
        const serverNotifications = notifications.map(n => ({
          ...n,
          read: n.is_read || n.read || false
        }));

        // Obtener notificaciones actuales sin ID (recibidas por socket pero no persistidas aún)
        const currentSocketOnlyNotifications = this.notificationsSubject.value.filter(n => !n.id);

        // Combinar: notificaciones del servidor + notificaciones temporales de socket
        // Las del servidor tienen prioridad (por si ya se persistió)
        const existingServerIds = new Set(serverNotifications.map(n => n.id));
        const socketNotificationsToKeep = currentSocketOnlyNotifications.filter(n => {
          // Mantener solo si no hay una del servidor con el mismo ticket_id
          return !serverNotifications.some(sn =>
            sn.ticket_id === n.ticket_id &&
            sn.type === n.type &&
            Math.abs(new Date(sn.created_at || sn.timestamp || 0).getTime() - new Date(n.timestamp || 0).getTime()) < 10000
          );
        });

        const combinedNotifications = [...serverNotifications, ...socketNotificationsToKeep];
        this.notificationsSubject.next(combinedNotifications);
      },
      error: (error) => {
        if (isDevMode()) {
          console.error('Error obteniendo notificaciones:', error);
        }
      }
    });
  }

  markAsRead(notification: TicketNotification, callback?: () => void) {
    if (!notification.id) return;

    this.http.post<{ success: boolean; shared?: boolean; markedCount?: number }>(`${environment.backendUrl}/api/notifications/read/${notification.id}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: (response) => {
        // Si fue notificación compartida (external_email), refrescar todas las notificaciones
        // porque el backend marcó como leídas las de todos los usuarios
        if (response.shared) {
          this.fetchUnreadNotifications();
        } else {
          const current = this.notificationsSubject.value;
          // En lugar de eliminar, marcar como leída para mantener el historial
          const updated = current.map(n =>
            n.id === notification.id
              ? { ...n, read: true, is_read: true }
              : n
          );
          this.notificationsSubject.next(updated);
        }
        if (callback) callback();
      },
      error: (error) => console.error('Error marcando notificación como leída:', error)
    });
  }

  markAllAsRead() {
    this.http.post(`${environment.backendUrl}/api/notifications/read-all`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: () => {
        // Actualizar el estado local: marcar todas las notificaciones como leídas
        const current = this.notificationsSubject.value;
        const updatedNotifications = current.map(n => ({ ...n, read: true, is_read: true }));
        this.notificationsSubject.next(updatedNotifications);
      },
      error: (error) => console.error('Error marcando todas las notificaciones como leídas:', error)
    });
  }

  removeNotification(notification: TicketNotification) {
    const current = this.notificationsSubject.value;
    const updated = current.filter(n => n.id !== notification.id);
    this.notificationsSubject.next(updated);
  }

  deleteNotification(notification: TicketNotification) {
    if (!notification.id) return;

    this.http.delete(`${environment.backendUrl}/api/notifications/${notification.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: () => this.removeNotification(notification),
      error: (error) => console.error('Error eliminando notificación:', error)
    });
  }

  deleteAllRead() {
    this.http.delete(`${environment.backendUrl}/api/notifications/read`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: () => this.fetchUnreadNotifications(),
      error: (error) => console.error('Error eliminando notificaciones leídas:', error)
    });
  }

  markTicketNotificationsAsRead(ticketId: string) {
    this.http.post(`${environment.backendUrl}/api/notifications/read-ticket/${ticketId}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: () => this.fetchUnreadNotifications(),
      error: (error) => console.error('Error marcando notificaciones del ticket como leídas:', error)
    });
  }

  clear() {
    this.notificationsSubject.next([]);
  }

  markSingleNotificationAsRead(notificationId: string) {
    return this.http.post(`${environment.backendUrl}/api/notifications/read/${notificationId}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
  }

  private async checkMaintenanceStatus() {
    try {
      const response = await this.http.get<any>(`${environment.backendUrl}/api/maintenance/status`).toPromise();
      this.ngZone.run(() => {
        this.maintenanceSubject.next({
          active: response.is_active,
          message: response.message,
          countdown: response.countdown_seconds || 0
        });
      });
    } catch (error) {
      console.error('Error verificando estado de mantenimiento:', error);
    }
  }
}
