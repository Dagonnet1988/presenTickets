import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NotificationService, TicketNotification } from './notification.service';
import { NotificationTypePipe } from './notification-type.pipe';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatBadgeModule, MatMenuModule, NotificationTypePipe],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.css']
})
export class NotificationBellComponent {
  notifications: TicketNotification[] = [];
  unreadCount = 0;

  constructor(private notificationService: NotificationService, private router: Router) {
    this.notificationService.notifications$.subscribe((n) => {
      this.notifications = n;
      this.unreadCount = n.filter((x) => !x.read).length;
    });
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  markAsRead(notification: TicketNotification) {
    this.notificationService.markAsRead(notification);
  }

  // Eliminar una notificación del backend y del listado local
  removeNotification(notification: TicketNotification) {
    this.notificationService.deleteNotification(notification);
  }

  // Limpiar todas las notificaciones leídas del backend y del listado local
  clearAllRead() {
    this.notificationService.deleteAllRead();
  }

  goToTicket(notification: TicketNotification) {
    // Marcar como leída en backend y refrescar notificaciones
    this.notificationService.markAsRead(notification, () => {
      setTimeout(() => {
        this.router.navigate(['/ticket', notification.data.ticketId]);
      }, 0);
    });
  }
}
