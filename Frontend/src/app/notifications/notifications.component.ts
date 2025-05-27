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

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NotificationService, TicketNotification } from '../notification.service';
import { NotificationTypePipe } from '../notification-type.pipe';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatListModule, CommonModule, NotificationTypePipe, MatIconModule, MatButtonModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {
  public notifications: TicketNotification[] = [];

  constructor(private router: Router, private notificationService: NotificationService) {
    this.notificationService.notifications$.subscribe(n => {
      this.notifications = n;
    });
  }

  ngOnInit(): void {}

  goToTicket(ticketId: number): void {
    this.router.navigate(['/ticket', ticketId]);
  }
}
