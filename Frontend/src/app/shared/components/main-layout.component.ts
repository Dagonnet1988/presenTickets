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

import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from '../../banner/banner.component';
import { SidebarComponent } from '../../sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { FooterComponent } from '../../footer/footer.component';

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
        <div class="content-wrapper">
          <router-outlet></router-outlet>
        </div>
        <app-footer></app-footer>
      </div>
    </div>
  `,
  styles: [`
    .layout-container {
      display: flex;
      margin-top: 80px; /* Espacio para el banner fijo */
      min-height: calc(100vh - 80px); /* Cambiar height por min-height */
      width: 100%;
      position: relative;
      /* Remover overflow: hidden que causa el corte */
    }    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 24px 24px 0 274px; /* Removemos padding-bottom para el footer */
      min-height: calc(100vh - 80px); /* Cambiar a min-height */
      background-color: #f8f9fa;
      transition: padding 0.3s ease;
      width: 100%;
    }

    .content-wrapper {
      flex: 1; /* Esto hace que el contenido principal ocupe el espacio disponible */
      padding-bottom: 24px; /* Espacio interno para el contenido */
      /* Removemos overflow-y: auto para evitar doble scroll */
      /* El scroll lo manejará el body naturalmente */
    }
    .main-content.sidebar-collapsed {
      padding-left: 88px;
    }

    /* Media queries para diseño responsive */
    @media (max-width: 992px) {
      .main-content {
        padding: 20px 20px 0 20px;
      }
      .content-wrapper {
        padding-bottom: 20px;
      }
    }
    @media (max-width: 768px) {
      .main-content {
        padding: 24px 24px 0 24px;
      }
      .main-content.sidebar-collapsed {
        padding-left: 24px;
      }
      .content-wrapper {
        padding-bottom: 24px;
      }
    }
    @media (max-width: 480px) {
      .layout-container {
        margin-top: 60px;
        min-height: calc(100vh - 60px);
      }
      .main-content {
        padding: 12px 12px 0 12px;
        min-height: calc(100vh - 60px);
      }
      .content-wrapper {
        padding-bottom: 12px;
      }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  isSidebarCollapsed = false;
  private readonly SIDEBAR_STATE_KEY = 'sidebarCollapsed';

  ngOnInit(): void {
    // Restaurar estado inicial del sidebar desde localStorage
    try {
      const savedState = localStorage.getItem(this.SIDEBAR_STATE_KEY);
      if (savedState !== null) {
        this.isSidebarCollapsed = JSON.parse(savedState);
      }
    } catch (e) {
      console.warn('No se pudo restaurar el estado del sidebar:', e);
    }
  }

  onSidebarToggle(isCollapsed: boolean): void {
    this.isSidebarCollapsed = isCollapsed;
  }
}
