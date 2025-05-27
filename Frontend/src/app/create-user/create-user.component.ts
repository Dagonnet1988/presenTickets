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
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '../user.service';
import { ErrorDialogComponent } from '../error-dialog/error-dialog.component';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    MatSnackBarModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './create-user.component.html',
  styleUrls: ['./create-user.component.css']
})
export class CreateUserComponent {
  userForm: FormGroup;
  roles = [
    { value: 'tech', label: 'Técnico' },
    { value: 'user', label: 'Usuario' }
  ];
  selectedFile: File | null = null;

  constructor(private fb: FormBuilder, private userService: UserService, private snackBar: MatSnackBar, private dialog: MatDialog) {
    this.userForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      role: ['', Validators.required],
      firstname: [''],
      lastname: [''],
      email: ['', [Validators.email]],
      phone: ['']
    });

    // Escuchar cambios en el campo username y asignar su valor al campo password
    this.userForm.get('username')?.valueChanges.subscribe((username: string) => {
      this.userForm.get('password')?.setValue(username);
    });
  }

  onSubmit(): void {
    if (this.userForm.valid) {
      this.userService.createUser(this.userForm.value).subscribe({
        next: () => {
          this.snackBar.open('✅ Usuario creado exitosamente', 'Cerrar', { duration: 3000 });
          this.userForm.reset();
        },
        error: (err) => {
          console.log('Error al crear el usuario:', err);
          this.snackBar.open('❌ Error al crear el usuario', 'Cerrar', { duration: 3000 });
        }
      });
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.snackBar.open('Archivo seleccionado: ' + this.selectedFile.name, 'Cerrar', { duration: 3000 });
    }
  }

  processFile(): void {
    if (!this.selectedFile) {
      this.snackBar.open('❌ No se ha seleccionado ningún archivo', 'Cerrar', { duration: 3000 });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const lines = content.split('\n').map(line => line.trim());
      const headers = lines[0].split(',');

      // Validar que el archivo tenga las columnas requeridas
      const requiredHeaders = ['username', 'firstname', 'lastname', 'email', 'phone'];
      const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
      if (missingHeaders.length > 0) {
        this.snackBar.open(`❌ El archivo no tiene las columnas requeridas: ${missingHeaders.join(', ')}`, 'Cerrar', { duration: 5000 });
        return;
      }

      // Procesar las filas del archivo
      const users = lines.slice(1).map(line => {
        const values = line.split(',');
        const user: any = {};
        headers.forEach((header, index) => {
          user[header] = values[index]?.trim() || null; // Asignar null si el valor está vacío
          user.password = user.username; // Asignar el username como password
          user.role = 'user'; // Asignar 'user' como rol por defecto
        });
        return user;
      });

      const errors: string[] = []; // Lista para almacenar los errores
      const validUsers: any[] = []; // Lista para almacenar los usuarios válidos

      // Validar usuarios usando Promise.all
      const validationPromises = users.map(user => {
        return this.userService.checkUsernameExists(user.username).toPromise().then(exists => {
          if (exists) {
            errors.push(`❌ El identificador ${user.username} ya existe en la base de datos`);
          } else {
            validUsers.push(user); // Agregar a la lista de usuarios válidos
          }
        }).catch(err => {
          console.error(`Error al verificar el identificador ${user.username}:`, err);
          errors.push(`❌ Error al verificar el identificador ${user.username}`);
        });
      });

      Promise.all(validationPromises).then(() => {

        if (errors.length > 0) {
          // Mostrar los errores en un diálogo si hay alguno
          this.dialog.open(ErrorDialogComponent, {
            width: '600px',
            height: '400px',
            data: { errors }
          });
        } else {
          // Si no hay errores, enviar los usuarios válidos al backend
          this.createUsers(validUsers);
        }
      });
    };

    reader.readAsText(this.selectedFile);
  }

  createUsers(users: any[]): void {
    let createdCount = 0; // Contador de usuarios creados exitosamente


    const creationPromises = users.map(user =>
      this.userService.createUser(user).toPromise().then(() => {
        createdCount++;
        this.snackBar.open(`✅ Usuario ${user.username} creado exitosamente`, 'Cerrar', { duration: 3000 });
      }).catch(err => {
        const errorMessage = err.error?.message || 'Error desconocido';
        console.error(`Error al crear el usuario ${user.username}:`, err);
        this.snackBar.open(`❌ Error al crear el usuario ${user.username}: ${errorMessage}`, 'Cerrar', { duration: 5000 });
      })
    );

    Promise.all(creationPromises).then(() => {
      this.snackBar.open(`✅ Se crearon ${createdCount} usuarios exitosamente`, 'Cerrar', { duration: 5000 });
    });
  }

  downloadTemplate(): void {
    const csvContent = 'username,firstname,lastname,email,phone\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'usuarios.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
