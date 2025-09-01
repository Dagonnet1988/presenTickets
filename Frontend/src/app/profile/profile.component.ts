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

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { UserService } from '../shared/services/user.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatIconModule
  ]
})
export class ProfileComponent implements OnInit {
  user: any;
  isEditing: boolean = false;
  userID: string = '';
  userForm!: FormGroup;
  passwordForm!: FormGroup;
  passwordChangeMode = false;
  userRole: string = '';
  isPhoneReadonly: boolean = false;

  constructor(private userService: UserService, private authService: AuthService, private fb: FormBuilder, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.userID = this.authService.getUserId() || '';
    this.userRole = this.authService.getUserRole() || '';
    this.isPhoneReadonly = this.userRole === 'user';
    this.initForms();
    this.getUserData();
  }

  initForms() {
    this.userForm = this.fb.group({
      email: ['', [Validators.email]],
      firstname: [''],
      lastname: [''],
      phone: ['']
    });
    this.passwordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  getUserData(): void {
    this.userService.getUser(this.userID).subscribe(data => {
      this.user = data;
      this.userForm.patchValue({
        email: data.email,
        firstname: data.firstname,
        lastname: data.lastname,
        phone: data.phone
      });

      // Actualizar el estado de readonly del teléfono basado en el rol del usuario
      this.isPhoneReadonly = data.role === 'user';

      // Deshabilitar el campo teléfono si es readonly
      if (this.isPhoneReadonly) {
        this.userForm.get('phone')?.disable();
      } else {
        this.userForm.get('phone')?.enable();
      }
    });
  }

  saveProfile(): void {
    if (this.userForm.invalid) {
      this.snackBar.open('Datos inválidos', 'Cerrar', { duration: 3000 });
      return;
    }

    // Preparar los datos para enviar
    let profileData = { ...this.userForm.value };

    // Si el campo teléfono está deshabilitado, incluir el valor original
    if (this.isPhoneReadonly && this.user?.phone) {
      profileData.phone = this.user.phone;
    }

    this.userService.updateProfile(this.userID, profileData).subscribe({
      next: (response) => {
        this.snackBar.open('Perfil actualizado', 'Cerrar', { duration: 3000 });
      },
      error: (error) => {
        console.error('Error updating profile:', error);
        this.snackBar.open('Error al actualizar el perfil', 'Cerrar', { duration: 3000 });
      }
    });
  }

  enablePasswordChange() {
    this.passwordChangeMode = true;
    this.passwordForm.reset();
  }
  savePassword() {
    if (this.passwordForm.invalid) {
      this.snackBar.open('La contraseña debe tener al menos 6 caracteres.', 'Cerrar', { duration: 3000 });
      return;
    }
    this.userService.updateProfile(this.userID, { password: this.passwordForm.value.password }).subscribe({
      next: (response) => {
        this.snackBar.open('Contraseña actualizada', 'Cerrar', { duration: 3000 });
        this.passwordChangeMode = false;
      },
      error: (error) => {
        console.error('Error updating password:', error);
        this.snackBar.open('Error al actualizar la contraseña', 'Cerrar', { duration: 3000 });
      }
    });
  }

  // Retorna un nombre legible según el rol
  getRoleDisplay(role: string): string {
    const roles: {[key: string]: string} = {
      'admin': 'Administrador',
      'tech': 'Técnico',
      'user': 'Usuario'
    };
    return roles[role] || role;
  }

  // Cancela el modo de cambio de contraseña
  cancelPasswordChange(): void {
    this.passwordChangeMode = false;
    this.passwordForm.reset();
  }
}
