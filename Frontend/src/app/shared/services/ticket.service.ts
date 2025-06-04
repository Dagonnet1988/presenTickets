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
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private apiUrl = environment.ticket;
  private apiUrlComments = environment.comment;

  constructor(private http: HttpClient) { }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  getTickets(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, { headers: this.getAuthHeaders() });
  }

  getTicketDetails(ticketId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${ticketId}`, { headers: this.getAuthHeaders() });
  }

  getComments(ticketId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrlComments}/${ticketId}`, { headers: this.getAuthHeaders() });
  }
  createTicket(ticketData: FormData): Observable<any> {
    // Para FormData, dejamos que el interceptor agregue automáticamente el token
    return this.http.post<any>(this.apiUrl, ticketData);
  }
  sendMessage(ticketId: string, formData: FormData): Observable<any> {
    // Para FormData, dejamos que el interceptor agregue automáticamente el token
    // No agregamos Content-Type porque el navegador lo hace automáticamente para FormData
    return this.http.post<any>(`${this.apiUrlComments}/${ticketId}`, formData);
  }
  updateTicketStatus(ticketId: string, status: string, actorRole: string): Observable<any> {
    console.log(`🌐 TicketService: Enviando PATCH a /tickets/${ticketId}`, { status, actorRole });
    return this.http.patch<any>(`${this.apiUrl}/${ticketId}`, { status, actorRole }, { headers: this.getAuthHeaders() });
  }

  updateTicketTechnician(ticketId: string, assigned_to: number ): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${ticketId}`, { assigned_to }, { headers: this.getAuthHeaders() });
  }

  updateTicketPriority(ticketId: string, priority: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${ticketId}`, { priority }, { headers: this.getAuthHeaders() });
  }

  updateTicketName(ticketId: string, name: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${ticketId}`, { name }, { headers: this.getAuthHeaders() });
  }
}
