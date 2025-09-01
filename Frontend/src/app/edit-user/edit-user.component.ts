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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserService } from '../shared/services/user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-edit-user',
  standalone: true,
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.css'],  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    RouterModule
  ],
})
export class EditUserComponent implements OnInit {
  userForm!: FormGroup;
  userId!: string;
  userRole!: string;

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService // Inyectar AuthService
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.paramMap.get('id')!;
    this.userRole = this.authService.getUserRole() || '';
    this.initializeForm();
    this.loadUser();
  }

  // Inicializar el formulario
  initializeForm() {
    this.userForm = this.fb.group({
      username: ['', Validators.required],
      email: ['', [Validators.email]],
      role: ['', Validators.required],
      firstname: [''],
      lastname: [''],
      phone: [''],
      created_at: [{value: '' ,  disabled: true}],
    });
  }

  // Cargar los datos del usuario
  loadUser() {
    this.userService.getUser(this.userId).subscribe(
      (user) => {
        // Si el usuario no es admin, restringir la edición de roles
        if (user.id !== +this.userId) {
          this.snackBar.open('No tienes permiso para editar este usuario', 'Cerrar', { duration: 3000 });
          this.router.navigate(['/']);
          return;
        }

        this.userForm.patchValue(user);
      },
      (error) => {
        console.error('Error al cargar el usuario:', error); // Registrar el error en la consola
        const errorMessage = error?.error?.message || 'Error desconocido al cargar el usuario.';
        this.snackBar.open(errorMessage, 'Cerrar', { duration: 5000 }); // Mostrar un mensaje más detallado
      }
    );
  }  // Guardar los cambios
  saveChanges() {
    if (this.userForm.invalid) {
      this.snackBar.open('Por favor, completa todos los campos obligatorios.', 'Cerrar', { duration: 3000 });
      return;
    }

    // Prevenir que usuarios con rol 'user' guarden cambios si no son el mismo usuario
    if (this.userRole === 'user' && this.authService.getUserId() !== this.userId) {
      this.snackBar.open('No tienes permiso para editar este usuario', 'Cerrar', { duration: 3000 });
      return;
    }

    // Obtener los valores del formulario, incluyendo los campos deshabilitados
    const formData = { ...this.userForm.value };
    if (this.userForm.get('phone')?.disabled) {
      formData.phone = this.userForm.get('phone')?.value;
    }

    this.userService.updateUser(this.userId, formData).subscribe(
      (response) => {
        const message = response?.message || 'Usuario actualizado exitosamente';
        this.snackBar.open(message, 'Cerrar', { duration: 3000 });
        this.router.navigate(['/manage-users']);
      },
      (error) => {
        console.error('Error al actualizar el usuario:', error);
        const errorMessage = error?.error?.message || 'Error desconocido al actualizar el usuario.';
        this.snackBar.open(errorMessage, 'Cerrar', { duration: 5000 });
      }
    );
  }
}
