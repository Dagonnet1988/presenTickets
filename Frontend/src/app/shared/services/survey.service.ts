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
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Survey {
  id: number;
  ticket_id: number;
  user_id: number;
  tech_id: number | null;
  rating: number;
  comment: string | null;
  area: string | null;
  category: string | null;
  response_time_minutes: number | null;
  resolution_time_minutes: number | null;
  created_at: string;
}

export interface SurveyStats {
  general: {
    total_surveys: number;
    average_rating: number;
    five_star: number;
    four_star: number;
    three_star: number;
    two_star: number;
    one_star: number;
  };
  byTechnician: Array<{
    tech_id: number;
    tech_name: string;
    total_surveys: number;
    average_rating: number;
  }>;
  byArea: Array<{
    area: string;
    total_surveys: number;
    average_rating: number;
  }>;
  byCategory: Array<{
    category: string;
    total_surveys: number;
    average_rating: number;
  }>;
  trend: Array<{
    month: string;
    total_surveys: number;
    average_rating: number;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class SurveyService {
  private apiUrl = `${environment.apiUrl}/api/surveys`;

  constructor(private http: HttpClient) {}

  /**
   * Crear encuesta para un ticket
   */
  submitSurvey(ticketId: number, rating: number, comment?: string): Observable<{ success: boolean; message: string; survey: Survey }> {
    return this.http.post<{ success: boolean; message: string; survey: Survey }>(
      `${this.apiUrl}/${ticketId}`,
      { rating, comment }
    );
  }

  /**
   * Obtener encuesta de un ticket
   */
  getSurvey(ticketId: number): Observable<{ exists: boolean; survey: Survey | null }> {
    return this.http.get<{ exists: boolean; survey: Survey | null }>(
      `${this.apiUrl}/ticket/${ticketId}`
    );
  }

  /**
   * Verificar si un ticket tiene encuesta (rápido)
   */
  checkSurvey(ticketId: number): Observable<{ hasSurvey: boolean; rating: number | null }> {
    return this.http.get<{ hasSurvey: boolean; rating: number | null }>(
      `${this.apiUrl}/check/${ticketId}`
    );
  }

  /**
   * Obtener estadísticas de encuestas (solo tech/admin)
   */
  getStats(): Observable<SurveyStats> {
    return this.http.get<SurveyStats>(`${this.apiUrl}/stats`);
  }

  /**
   * Obtener tickets pendientes de calificar del usuario
   */
  getPendingSurveys(): Observable<{ pending: any[]; count: number }> {
    return this.http.get<{ pending: any[]; count: number }>(`${this.apiUrl}/pending`);
  }
}
