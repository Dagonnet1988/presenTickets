import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule
  ],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {
  authForm!: FormGroup;
  loginError: string | null = null;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    this.authForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.authForm.valid) {
      const { username, password } = this.authForm.value;
      this.authService.login(username, password).subscribe(response => {
        if (response.message === 'Inicio de sesión exitoso') {
          this.router.navigate(['/']);
        } else {
          this.loginError = response.message;
        }
      }, error => {
        console.error('Error durante el login:', error);
        this.loginError = 'Error durante el login. Por favor, inténtelo de nuevo.';
      });
    } else {
      console.log('Formulario inválido');
    }
  }
}
