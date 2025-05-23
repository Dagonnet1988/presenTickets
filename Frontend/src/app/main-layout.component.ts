import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from './banner/banner.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    BannerComponent,
    SidebarComponent,
    CommonModule
  ],  template: `
    <app-banner></app-banner>
    <div class="layout-container">
      <app-sidebar></app-sidebar>
      <div class="main-content">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,  styles: [`
    .layout-container {
      display: flex;
      margin-top: 80px; /* Espacio para el banner fijo */
      height: calc(100vh - 80px);
    }
    .main-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      min-height: calc(100vh - 80px);
    }
  `]
})
export class MainLayoutComponent {}
