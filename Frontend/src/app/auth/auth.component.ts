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
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../shared/services/auth.service';
import { NotificationService } from '../shared/services/notification.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {
  authForm!: FormGroup;
  loginError = '';
  sessionExpired = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    // Limpiar cualquier estado previo completamente
    this.loginError = '';
    this.sessionExpired = false;

    // Si ya está logueado, redirigir al home
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/']);
      return;
    }

    this.authForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    // Verificar si el usuario fue redirigido por sesión expirada
    this.route.queryParams.subscribe(params => {
      if (params['expired'] === 'true') {
        this.sessionExpired = true;

        // Mostrar mensaje con estilo más llamativo
        this.snackBar.open(
          '⚠️ Tu sesión ha expirado. Por favor, inicia sesión nuevamente para continuar.',
          'Entendido',
          {
            duration: 10000,
            panelClass: 'session-expired-snackbar',
            horizontalPosition: 'center',
            verticalPosition: 'top'
          }
        );
      }
    });
  }

  onSubmit(): void {
    if (this.authForm.valid) {
      // Limpiar errores previos
      this.loginError = '';

      const { username, password } = this.authForm.value;
      this.authService.login(username, password).subscribe(response => {
        if (response.message === 'Inicio de sesión exitoso') {
          // Inicializar notificaciones después del login exitoso
          setTimeout(() => {
            this.notificationService.initializeNotificationsForUser();
          }, 1000);

          // Redirigir directamente al home
          this.router.navigate(['/']);
        } else if (response.maintenance) {
          // Sistema en mantenimiento - redirigir a página informativa
          this.router.navigate(['/maintenance'], {
            queryParams: {
              message: response.maintenanceMessage || 'Sistema en mantenimiento. Disculpe las molestias.'
            }
          });
        } else {
          this.loginError = response.message;
        }
      }, error => {
        console.error('Error durante el login:', error);
        // Verificar si es error de mantenimiento
        if (error.status === 503 && error.error?.maintenance) {
          this.router.navigate(['/maintenance'], {
            queryParams: {
              message: error.error.maintenanceMessage || 'Sistema en mantenimiento. Disculpe las molestias.'
            }
          });
        } else {
          this.loginError = error.error?.message || 'Error durante el login. Por favor, inténtelo de nuevo.';
        }
      });
    }
  }
}
