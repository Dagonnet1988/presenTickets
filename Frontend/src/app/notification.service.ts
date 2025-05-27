/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 *
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

export interface TicketNotification {
  id?: number;
  type: string;
  data: any;
  read?: boolean;
  timestamp?: Date;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private socket: Socket;
  private notificationsSubject = new BehaviorSubject<TicketNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  constructor(private ngZone: NgZone, private authService: AuthService, private http: HttpClient) {
    this.socket = io(environment.backendUrl, {
      transports: ['websocket'],
      withCredentials: true
    });
    const userId = this.authService.getUserId();
    if (userId) {
      this.socket.emit('register', String(userId));
      this.fetchUnreadNotifications(); // <-- Cargar notificaciones persistentes al iniciar
    }    this.socket.on('ticket-notification', (notification: TicketNotification) => {
      this.ngZone.run(() => {
        const current = this.notificationsSubject.value;

        // Verificar si la notificación es para el ticket actualmente visible
        const currentTicketId = this.getCurrentTicketIdFromUrl();
        const isForCurrentTicket = notification.data?.ticketId === currentTicketId;

        // Asegurar que tenemos el formato correcto de los datos
        const processedNotification = {
          ...notification,
          read: false,
          timestamp: new Date(),
          data: {
            ...notification.data,
            // Asegurar que ticketId está disponible correctamente
            ticketId: notification.data?.ticketId || (typeof notification.data === 'object' ? notification.data.ticketId : null)
          }
        };

        // Si es una notificación para el ticket que estamos viendo, emitir evento de actualización
        if (isForCurrentTicket) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
          }, 100);
        }

        // Actualizar la UI inmediatamente
        this.notificationsSubject.next([processedNotification, ...current]);

        // Refrescar desde el servidor después de un breve retraso
        setTimeout(() => this.fetchUnreadNotifications(), 500);
      });
    });
  }

  // Obtiene el ID del ticket de la URL actual, si estamos en una página de ticket
  private getCurrentTicketIdFromUrl(): string | null {
    // Intentar extraer el ID del ticket de la URL actual
    const urlMatch = window.location.pathname.match(/\/ticket\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  // Devuelve el array actual de notificaciones
  getNotifications(): TicketNotification[] {
    return this.notificationsSubject.value;
  }

  fetchUnreadNotifications() {
    this.http.get<any[]>(`${environment.backendUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe(
      (notifications) => {
        // Mapear a formato TicketNotification
        const mapped = notifications.map(n => ({
          type: n.type,
          data: { ticketId: n.ticket_id },
          read: n.is_read,
          timestamp: new Date(n.created_at),
          id: n.id,
          message: n.message
        }));

        // Reemplazar notificaciones almacenadas localmente con las del servidor
        // que tienen IDs válidos
        this.notificationsSubject.next(mapped);
      },
      (err) => {
        console.error("Error al obtener notificaciones:", err);
      }
    );

    // Devolvemos la promesa para posible manejo asíncrono
    return this.http.get<any[]>(`${environment.backendUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).toPromise();
  }

  markAsRead(notification: TicketNotification, callback?: () => void) {
    if (!notification.id) return;
    this.http.post(`${environment.backendUrl}/api/notifications/read/${notification.id}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe(() => {
      // Eliminar la notificación del listado local tras marcarla como leída
      const current = this.notificationsSubject.value.filter(n => n.id !== notification.id);
      this.notificationsSubject.next(current);
      if (callback) callback();
    });
  }
  // Marcar todas como leídas en backend y eliminar del listado local
  markAllAsRead() {
    const unread = this.notificationsSubject.value;
    if (unread.length === 0) return;

    // Limpiamos la lista de notificaciones inmediatamente para mejor UX
    this.notificationsSubject.next([]);

    // En segundo plano, marcamos cada notificación como leída en la BD
    let completed = 0;
    unread.forEach(n => {
      if (!n.id) return;

      this.http.post(`${environment.backendUrl}/api/notifications/read/${n.id}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).subscribe({
        next: () => {
          completed++;
        },
        error: (err) => {
          console.error(`Error al marcar notificación ${n.id} como leída:`, err);
        }
      });
    });
  }

  // Eliminar una notificación del listado
  removeNotification(notification: TicketNotification) {
    const current = this.notificationsSubject.value.filter(n => n !== notification);
    this.notificationsSubject.next(current);
  }

  // Eliminar una notificación en backend y del listado local
  deleteNotification(notification: TicketNotification) {
    if (!notification.id) return;
    this.http.delete(`${environment.backendUrl}/api/notifications/${notification.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe(() => {
      this.removeNotification(notification);
    });
  }

  // Eliminar todas las notificaciones leídas en backend y limpiar local
  deleteAllRead() {
    this.http.delete(`${environment.backendUrl}/api/notifications/read/all`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).subscribe(() => {
      const current = this.notificationsSubject.value.filter(n => !n.read);
      this.notificationsSubject.next(current);
    });
  }

  clear() {
    this.notificationsSubject.next([]);
  }
}
