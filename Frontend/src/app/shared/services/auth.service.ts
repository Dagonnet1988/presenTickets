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

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.auth;

  constructor(private http: HttpClient) {}  // Iniciar sesión
  login(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, { username, password }).pipe(
      tap(response => {
        if (response.token) {
          if (this.isLocalStorageAvailable()) {
            localStorage.setItem('token', response.token);
          } else {
            console.error('localStorage is not available!');
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
      if (!token) {
        return false;
      }

      try {
        // Decodificar el JWT para verificar su expiración
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000); // Tiempo actual en segundos

        // Verificar si el token ha expirado
        if (payload.exp && payload.exp < currentTime) {
          console.log('Token expirado, removiendo del localStorage');
          localStorage.removeItem('token');
          return false;
        }

        return true;
      } catch (e) {
        console.error('Error al decodificar el token:', e);
        localStorage.removeItem('token'); // Remover token malformado
        return false;
      }
    }
    return false;
  }// Obtener el userId del usuario autenticado (from token if needed)
  getUserId(): string | null {
    if (this.isLocalStorageAvailable()) {
      const token = localStorage.getItem('token');
      if (token) {
        // Optionally decode JWT to get userId
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          return payload.id || payload.userId || null;
        } catch (e) {
          console.error('Error decoding token:', e);
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

  // Verificar si un token es válido (no expirado)
  private isTokenValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp && payload.exp > currentTime;
    } catch (e) {
      return false;
    }
  }

  // Obtener información del token (incluyendo tiempo de expiración)
  getTokenInfo(): { isValid: boolean; expiresAt: Date | null; timeLeft: number } | null {
    if (!this.isLocalStorageAvailable()) {
      return null;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;
      const timeLeft = payload.exp ? Math.max(0, payload.exp - currentTime) : 0;

      return {
        isValid: this.isTokenValid(token),
        expiresAt,
        timeLeft
      };
    } catch (e) {
      console.error('Error al obtener información del token:', e);
      return null;
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
