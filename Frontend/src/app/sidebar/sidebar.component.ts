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

import { Component, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';
import { CommonModule } from '@angular/common';
import { HomeComponent } from '../home/home.component';
import { RefreshTicketsService } from '../shared/services/refresh-tickets.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterModule,
  ],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  userRole: string = '';
  isCollapsed: boolean = false;
  @ViewChild(HomeComponent) homeComponent?: HomeComponent;
  @Output() sidebarToggled = new EventEmitter<boolean>();

  private readonly SIDEBAR_STATE_KEY = 'sidebarCollapsed';

  constructor(private authService: AuthService, private router: Router, private refreshTicketsService: RefreshTicketsService) {}

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';
    // Restaurar estado del sidebar desde localStorage
    this.restoreSidebarState();
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.saveSidebarState();
    this.sidebarToggled.emit(this.isCollapsed);
  }

  // Guardar estado del sidebar en localStorage
  private saveSidebarState(): void {
    try {
      localStorage.setItem(this.SIDEBAR_STATE_KEY, JSON.stringify(this.isCollapsed));
    } catch (e) {
      console.warn('No se pudo guardar el estado del sidebar:', e);
    }
  }

  // Restaurar estado del sidebar desde localStorage
  private restoreSidebarState(): void {
    try {
      const savedState = localStorage.getItem(this.SIDEBAR_STATE_KEY);
      if (savedState !== null) {
        this.isCollapsed = JSON.parse(savedState);
        // Emitir el estado restaurado para que el layout lo reciba
        setTimeout(() => this.sidebarToggled.emit(this.isCollapsed), 0);
      }
    } catch (e) {
      console.warn('No se pudo restaurar el estado del sidebar:', e);
    }
  }

  goToHomeAndRefresh() {
    this.router.navigate(['/']).then(() => {
      this.refreshTicketsService.triggerRefresh();
    });
  }
}

