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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private usersSubject = new BehaviorSubject<any[]>([]);
  users$ = this.usersSubject.asObservable();

  private apiUrlUsers = environment.user;

  constructor(private http: HttpClient) {}  private getAuthHeaders(): HttpHeaders {
    let token = '';
    if (typeof localStorage !== 'undefined') {
      token = localStorage.getItem('token') || '';
    }

    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  getUser(userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrlUsers}/${userId}`, { headers: this.getAuthHeaders() });
  }

  // Obtener información básica de un usuario (solo nombre)
  getUserBasic(userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrlUsers}/basic/${userId}`, { headers: this.getAuthHeaders() });
  }

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlUsers, { headers: this.getAuthHeaders() });
  }

  // Obtener lista de técnicos disponibles para asignación
  getTechnicians(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrlUsers}/technicians`, { headers: this.getAuthHeaders() });
  }

  updateUser(userId: string, user: any): Observable<any> {
    return this.http.patch<any>(`${this.apiUrlUsers}/${userId}`, user, { headers: this.getAuthHeaders() });
  }

  // Método específico para actualizar perfil propio sin restricciones de admin
  updateProfile(userId: string, profileData: any): Observable<any> {
    return this.http.patch<any>(`${this.apiUrlUsers}/profile/${userId}`, profileData, { headers: this.getAuthHeaders() });
  }

  createUser(user: any): Observable<any> {
    return this.http.post<any>(this.apiUrlUsers, user, { headers: this.getAuthHeaders() });
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrlUsers}/${userId}`, { status : 0 }, { headers: this.getAuthHeaders() }
    );
  }
  reactiveUser(userId: string): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrlUsers}/${userId}`, { status : 1 }, { headers: this.getAuthHeaders() }
    );
  }  loadUsers(): void {
    this.http.get<any[]>(this.apiUrlUsers, { headers: this.getAuthHeaders() }).subscribe(
      (users) => {
        const filteredUsers = users.filter(user => user.role !== 'admin'); // Filtrar usuarios que no sean admin
        this.usersSubject.next(filteredUsers); // Emitir los usuarios actualizados
      },
      (error) => {
        console.error('Error al cargar usuarios:', error);

        // Mantener solo el log crítico de error de autenticación
        if (error.status === 401) {
          console.error('Error de autenticación (401). El token podría ser inválido o estar expirado.');
        }
      }
    );
  }
  checkUsernameExists(username: string): Observable<boolean> {
    return this.http.get<{ exists: boolean }>(`${this.apiUrlUsers}/exists/${username}`, { headers: this.getAuthHeaders() }).pipe(
      map(response => response.exists), // Extraer la propiedad `exists`
      catchError(err => {
        if (err.status === 404) {
          return of(false); // Si es un error 404, el usuario no existe
        }
        return of(true); // En caso de error desconocido, asumir que el usuario existe para evitar problemas
      })
    );
  }

  resetPassword(userId: number, newPassword: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrlUsers}/${userId}`, { password: newPassword });
  }
}
