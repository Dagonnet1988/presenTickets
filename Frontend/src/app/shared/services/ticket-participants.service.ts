/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Servicio para manejo de participantes de tickets
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TicketParticipant {
  user_id: number;
  username: string;
  full_name: string;
  role: string;
  email: string;
}

export interface AvailableUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class TicketParticipantsService {
  private apiUrl = `${environment.backendUrl}/api/tickets`;

  constructor(private http: HttpClient) {}

  /**
   * Obtener participantes de un ticket
   */
  getParticipants(ticketId: number): Observable<TicketParticipant[]> {
    return this.http.get<TicketParticipant[]>(`${this.apiUrl}/${ticketId}/participants`);
  }

  /**
   * Agregar participante a un ticket
   */
  addParticipant(ticketId: number, userId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${ticketId}/participants`, {
      userId: userId
    });
  }

  /**
   * Remover participante de un ticket
   */
  removeParticipant(ticketId: number, userId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${ticketId}/participants/${userId}`);
  }

  /**
   * Obtener usuarios disponibles para agregar como participantes
   */
  getAvailableUsers(ticketId: number, search?: string): Observable<AvailableUser[]> {
    let params = '';
    if (search && search.trim()) {
      params = `?search=${encodeURIComponent(search.trim())}`;
    }
    return this.http.get<AvailableUser[]>(`${this.apiUrl}/${ticketId}/available-users${params}`);
  }

  /**
   * Verificar si un usuario puede gestionar participantes
   */
  canManageParticipants(userRole: string): boolean {
    return userRole === 'admin' || userRole === 'tech';
  }
}
