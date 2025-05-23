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
        if (response.token) {
          if (this.isLocalStorageAvailable()) {
            localStorage.setItem('token', response.token);
            // No need to store userName or userRole separately
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
      const token = localStorage.getItem('token');
      // Basic check: token exists and is not expired (optional: decode and check exp)
      return !!token;
    }
    return false;
  }

  // Obtener el userId del usuario autenticado (from token if needed)
  getUserId(): string | null {
    if (this.isLocalStorageAvailable()) {
      const token = localStorage.getItem('token');
      if (token) {
        // Optionally decode JWT to get userId
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          return payload.id || payload.userId || null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  // Obtener el nombre del usuario autenticado
  getUserName(): string | null {
    if (this.isLocalStorageAvailable()) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          return payload.username || null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  getUserRole(): string | null {
    if (this.isLocalStorageAvailable()) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          return payload.role || null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  // Cerrar sesión
  logout(): void {
    if (this.isLocalStorageAvailable()) {
      localStorage.removeItem('token');
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
