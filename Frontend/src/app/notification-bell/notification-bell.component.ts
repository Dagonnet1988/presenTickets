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

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NotificationService, TicketNotification } from '../shared/services/notification.service';
import { NotificationTypePipe } from '../shared/pipes/notification-type.pipe';

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
  }  goToTicket(notification: TicketNotification) {
    // Obtenemos el ticketId de la notificación
    const ticketId = notification.ticket_id;
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket de la notificación');
      return;
    }

    // Verificar si ya estamos en la página del ticket
    const currentUrl = this.router.url;
    const isAlreadyOnTicketPage = currentUrl.includes(`/ticket/${ticketId}`);

    // Si la notificación no tiene ID (recibida por socket), intentamos sincronizar
    if (!notification.id) {
      console.log('Notificación sin ID detectada, intentando sincronizar con el servidor...');

      // 1. Primero sincronizamos notificaciones con el servidor
      this.notificationService.fetchUnreadNotifications();

      // 2. Después de un breve delay, buscar la notificación actualizada
      setTimeout(() => {
        const updatedNotifications = this.notificationService.getNotifications();
        const matchingNotification = updatedNotifications.find(n =>
          n.ticket_id === ticketId && n.id
        );

        // 3. Si encontramos la notificación con ID, la marcamos como leída
        if (matchingNotification && matchingNotification.id) {
          console.log('Se encontró la notificación con ID, marcando como leída:', matchingNotification);
          this.notificationService.markAsRead(matchingNotification, () => {
            if (isAlreadyOnTicketPage) {
              // Si ya estamos en la página, recargamos la misma (emitimos evento)
              window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
            } else {
              // Si no, navegamos al ticket
              this.router.navigate(['/ticket', ticketId]);
            }
          });
        } else {
          // 4. Si no la encontramos (raro, pero posible), navegamos o recargamos
          console.log('No se encontró la notificación con ID después de actualizar');
          if (isAlreadyOnTicketPage) {
            window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
          } else {
            this.router.navigate(['/ticket', ticketId]);
          }
        }
      }, 1000);

      return;
    }

    // Si tiene ID, proceder normal: marcar leída y navegar o recargar
    this.notificationService.markAsRead(notification, () => {
      setTimeout(() => {
        if (isAlreadyOnTicketPage) {
          // Si ya estamos en la página, recargamos la misma (emitimos evento)
          window.dispatchEvent(new CustomEvent('refresh-ticket-details'));
        } else {
          // Si no, navegamos al ticket
          this.router.navigate(['/ticket', notification.ticket_id]);
        }
      }, 0);
    });
  }
}
