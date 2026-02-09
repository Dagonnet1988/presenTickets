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
  unreadNotifications: TicketNotification[] = [];
  unreadCount = 0;

  constructor(private notificationService: NotificationService, private router: Router) {
    this.notificationService.notifications$.subscribe((n) => {
      this.notifications = n;
      // Filtrar solo las notificaciones no leídas
      const unread = n.filter((x) => !(x.read || (x as any).is_read));

      // Agrupar notificaciones de external_email por external_ticket_id
      // Para que solo aparezca una por ticket externo (evita duplicados entre técnicos)
      this.unreadNotifications = this.groupExternalEmailNotifications(unread);
      this.unreadCount = this.unreadNotifications.length;
    });
  }

  /**
   * Agrupa las notificaciones de tipo external_email por external_ticket_id
   * Solo muestra una notificación por ticket externo (la más reciente)
   */
  private groupExternalEmailNotifications(notifications: TicketNotification[]): TicketNotification[] {
    const emailNotifications = notifications.filter(n => n.type === 'external_email');
    const otherNotifications = notifications.filter(n => n.type !== 'external_email');

    // Agrupar emails por external_ticket_id, quedarse con el más reciente
    const emailGroups = new Map<string, TicketNotification>();
    for (const notification of emailNotifications) {
      const key = (notification as any).external_ticket_id || notification.id?.toString() || 'unknown';
      const existing = emailGroups.get(key);

      // Obtener fecha de la notificación (created_at del backend o timestamp)
      const getDate = (n: TicketNotification) => {
        const dateStr = (n as any).created_at || n.timestamp;
        return dateStr ? new Date(dateStr).getTime() : 0;
      };

      // Quedarse con la notificación más reciente
      if (!existing || getDate(notification) > getDate(existing)) {
        emailGroups.set(key, notification);
      }
    }

    // Combinar notificaciones agrupadas con las demás
    return [...Array.from(emailGroups.values()), ...otherNotifications]
      .sort((a, b) => {
        const dateA = (a as any).created_at || a.timestamp;
        const dateB = (b as any).created_at || b.timestamp;
        return new Date(dateB || 0).getTime() - new Date(dateA || 0).getTime(); // Más recientes primero
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
    // Obtenemos el ticketId de la notificación
    const ticketId = notification.ticket_id;

    // Para notificaciones de email externo sin ticket asociado,
    // solo marcamos como leída
    if (!ticketId) {
      if (notification.type === 'external_email') {
        // Marcar como leída y mostrar info del ticket externo
        this.markAsRead(notification);
        const externalId = (notification as any).external_ticket_id;
        if (externalId) {
          console.log(`Notificación de ticket externo #${externalId} marcada como leída`);
        }
        return;
      }
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
