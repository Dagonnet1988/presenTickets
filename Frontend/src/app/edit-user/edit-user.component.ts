import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-edit-user',
  standalone: true,
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule
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
    private router: Router
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.paramMap.get('id')!;
    this.userRole = this.getUserRole();
    this.initializeForm();
    this.loadUser();
  }

  // Método para obtener el rol del usuario
  getUserRole(): string {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('userRole') || '';
    }
    return ''; // Retorna un valor por defecto si localStorage no está disponible
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
        if (this.userRole !== 'admin' && user.id !== +this.userId) {
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
  }

  // Guardar los cambios
  saveChanges() {
    if (this.userForm.invalid) {
      this.snackBar.open('Por favor, completa todos los campos obligatorios.', 'Cerrar', { duration: 3000 });
      return;
    }

    this.userService.updateUser(this.userId, this.userForm.value).subscribe(
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
