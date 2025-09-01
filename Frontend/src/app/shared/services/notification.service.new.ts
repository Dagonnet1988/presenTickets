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
  type: string;
  data: any;
  read?: boolean;
  timestamp?: Date;
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

        if (currentTicketId === notification.ticket_id) {
          if (notification.id) {
            this.markSingleNotificationAsRead(notification.id.toString()).subscribe({
              next: () => {},
              error: (error) => console.error('Error marcando notificación como leída:', error)
            });
          }
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
          }, 100);
        } else {
          const newNotifications = [...current, notification];
          this.notificationsSubject.next(newNotifications);
        }

        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`Nuevo comentario en Ticket #${notification.external_ticket_id}`, {
              body: notification.message,
              icon: '/favicon.ico',
              tag: `ticket-${notification.ticket_id}`,
              badge: '/favicon.ico'
            });
          } catch (error) {
            console.error('Error mostrando notificación del navegador:', error);
          }
        }

        setTimeout(() => this.fetchUnreadNotifications(), 500);
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

  fetchUnreadNotifications() {
    if (!isPlatformBrowser(this.platformId)) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    this.http.get<TicketNotification[]>(`${environment.backendUrl}/api/notifications/unread`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (notifications) => {
        this.notificationsSubject.next(notifications);
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

    this.http.post(`${environment.backendUrl}/api/notifications/read/${notification.id}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe({
      next: () => {
        const current = this.notificationsSubject.value;
        const updated = current.filter(n => n.id !== notification.id);
        this.notificationsSubject.next(updated);
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
        this.notificationsSubject.next([]);
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
