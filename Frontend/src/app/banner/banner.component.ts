import { Component, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { NotificationBellComponent } from '../notification-bell.component';

@Component({
  selector: 'app-banner',
  standalone: true,
  imports: [
    CommonModule, // Para directivas básicas como *ngIf
    MatButtonModule,
    MatIconModule,
    RouterModule,
    NotificationBellComponent
  ],
  templateUrl: './banner.component.html',
  styleUrls: ['./banner.component.css']
})
export class BannerComponent implements OnInit {
  username: string | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.username = this.authService.getUserName(); // Use AuthService instead of localStorage
  }

  logout(): void {
    this.authService.logout(); // Lógica de cierre de sesión
    window.location.href = '/'; // Redirigir al login
  }
}
