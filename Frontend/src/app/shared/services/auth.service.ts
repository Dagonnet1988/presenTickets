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

import { Injectable, isDevMode } from '@angular/core';
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
    if (!this.isLocalStorageAvailable()) {
      return false;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return false;
    }

    if (this.isTokenValid(token)) {
      return true;
    } else {
      if (isDevMode()) {
        console.log('Token expirado o inválido, removiendo del localStorage');
      }
      localStorage.removeItem('token');
      return false;
    }
  }  // Obtener el userId del usuario autenticado
  getUserId(): string | null {
    return this.getTokenClaim('id') || this.getTokenClaim('userId');
  }

  // Obtener el nombre del usuario autenticado
  getUserName(): string | null {
    return this.getTokenClaim('username');
  }

  getUserRole(): string | null {
    return this.getTokenClaim('role');
  }

  // Método auxiliar para extraer claims del token
  private getTokenClaim(claim: string): string | null {
    if (!this.isLocalStorageAvailable()) {
      return null;
    }

    const token = localStorage.getItem('token');
    if (!token || !this.isTokenValid(token)) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload[claim] || null;
    } catch (e) {
      console.error('Error al extraer claim del token:', e);
      return null;
    }
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

      // Solo logs en modo debug si es necesario
      if (isDevMode() && payload.exp && (payload.exp - currentTime) < 300) { // Solo log si quedan menos de 5 minutos
        console.log('⚠️ Token cerca de expirar. Tiempo restante:', payload.exp - currentTime, 'segundos');
      }

      return payload.exp && payload.exp > currentTime;
    } catch (e) {
      console.error('Error validating token:', e);
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

  // Método temporal para debug - eliminar en producción
  debugToken(): void {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);

        // DEBUG: Solo en desarrollo
        if (isDevMode()) {
          console.log('🔍 DEBUG TOKEN:');
          console.log('Payload:', payload);
          console.log('Expira en:', new Date(payload.exp * 1000));
        }
        console.log('Diferencia (segundos):', payload.exp - currentTime);
        console.log('Es válido:', payload.exp > currentTime);
      } catch (e) {
        console.error('Error decodificando token:', e);
      }
    } else {
      console.log('No hay token en localStorage');
    }
  }
}
