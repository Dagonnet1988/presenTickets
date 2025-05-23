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
    }
    this.socket.on('ticket-notification', (notification: TicketNotification) => {
      this.ngZone.run(() => {
        const current = this.notificationsSubject.value;
        this.notificationsSubject.next([
          { ...notification, read: false, timestamp: new Date() },
          ...current
        ]);
      });
    });
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
          id: n.id
        }));
        this.notificationsSubject.next(mapped);
      },
      (err) => {}
    );
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
    const unread = this.notificationsSubject.value.filter(n => !n.read);
    if (unread.length === 0) return;
    let completed = 0;
    unread.forEach(n => {
      this.markAsRead(n, () => {
        completed++;
        if (completed === unread.length) {
          // Todas eliminadas del listado local
          this.notificationsSubject.next(this.notificationsSubject.value.filter(noti => noti.read === false));
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
