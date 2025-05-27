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

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from './banner/banner.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { FooterComponent } from './footer/footer.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,  imports: [
    RouterOutlet,
    BannerComponent,
    SidebarComponent,
    CommonModule,
    FooterComponent
  ],  template: `
    <app-banner></app-banner>
    <div class="layout-container">
      <app-sidebar (sidebarToggled)="onSidebarToggle($event)"></app-sidebar>
      <div class="main-content" [ngClass]="{'sidebar-collapsed': isSidebarCollapsed}">
        <router-outlet></router-outlet>
        <app-footer></app-footer>
      </div>
    </div>
  `,
  styles: [`
    .layout-container {
      display: flex;
      margin-top: 80px; /* Espacio para el banner fijo */
      height: calc(100vh - 80px);
      width: 100%;
      position: relative;
      overflow: hidden;
    }    .main-content {
      flex: 1;
      padding: 24px 24px 24px 274px; /* Añadimos padding-left para compensar el sidebar fijo */
      overflow-y: auto;
      min-height: calc(100vh - 80px);
      background-color: #f8f9fa;
      transition: padding 0.3s ease;
      width: 100%;
    }
    .main-content.sidebar-collapsed {
      padding-left: 88px;
    }

    /* Media queries para diseño responsive */
    @media (max-width: 992px) {
      .main-content {
        padding: 20px;
      }
    }
    @media (max-width: 768px) {
      .main-content {
        padding: 24px;
      }
      .main-content.sidebar-collapsed {
        padding-left: 24px;
      }
    }
    @media (max-width: 480px) {
      .layout-container {
        margin-top: 60px;
        height: calc(100vh - 60px);
      }
      .main-content {
        padding: 12px;
        min-height: calc(100vh - 60px);
      }
    }
  `]
})
export class MainLayoutComponent {
  isSidebarCollapsed = false;

  onSidebarToggle(isCollapsed: boolean): void {
    this.isSidebarCollapsed = isCollapsed;
  }
}
