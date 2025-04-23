import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.auth;

  constructor(private http: HttpClient) {}

  // Iniciar sesión
  login(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, { username, password }).pipe(
      tap(response => {
        if (response.message === 'Inicio de sesión exitoso') {
          if (this.isLocalStorageAvailable()) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userId', response.user.id); // Almacena el userId en localStorage
            localStorage.setItem('userName', response.user.username); // Almacena el nombre del usuario en localStorage
            localStorage.setItem('userRole', response.user.role); // Almacena el rol del usuario en localStorage
          }
        }
      }),
      catchError(error => {
        console.error('Error durante el login:', error);
        return of(error.error);
      })
    );
  }

  // Verificar si el usuario está autenticado
  isLoggedIn(): boolean {
    if (this.isLocalStorageAvailable()) {
      return !!localStorage.getItem('isLoggedIn');
    }
    return false;
  }

  // Obtener el userId del usuario autenticado
  getUserId(): string | null {
    if (this.isLocalStorageAvailable()) {
      return localStorage.getItem('userId');
    }
    return null;
  }

  // Obtener el nombre del usuario autenticado
  getUserName(): string | null {
    if (this.isLocalStorageAvailable()) {
      return localStorage.getItem('userName');
    }
    return null;
  }

  getUserRole(): string | null {
    if (this.isLocalStorageAvailable()) {
      return localStorage.getItem('userRole');
    }
    return null;
  }


  // Cerrar sesión
  logout(): void {
    if (this.isLocalStorageAvailable()) {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userId'); // Elimina el userId de localStorage
      localStorage.removeItem('userName'); // Elimina el nombre del usuario de localStorage
      localStorage.removeItem('userRole'); // Elimina el rol del usuario de localStorage
    }
  }

  // Verificar si localStorage está disponible
  private isLocalStorageAvailable(): boolean {
    try {
      const test = 'test';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }
}
