import { Component, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-banner',
  standalone: true,
  imports: [
    CommonModule, // Para directivas básicas como *ngIf
    MatButtonModule,
    MatIconModule,
    RouterModule
  ],
  templateUrl: './banner.component.html',
  styleUrls: ['./banner.component.css']
})
export class BannerComponent implements OnInit {
  username: string | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.username = localStorage.getItem('userName'); // Obtener el nombre de usuario de localStorage
  }

  logout(): void {
    this.authService.logout(); // Lógica de cierre de sesión
    window.location.href = '/auth'; // Redirigir al login
  }
}
