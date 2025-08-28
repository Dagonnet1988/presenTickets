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
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WhatsAppService {

  constructor(private http: HttpClient) { }

  /**
   * Obtener estado de conexión de WhatsApp
   */
  async getConnectionStatus(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/status`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Conectar WhatsApp
   */
  async connect(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/connect`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Desconectar WhatsApp
   */
  async disconnect(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/disconnect`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Enviar mensaje de prueba
   */
  async sendTestMessage(phoneNumber: string, message: string): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/test-message`, {
      phoneNumber,
      message
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener configuración del usuario
   */
  async getUserSettings(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/user-settings`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Actualizar configuración del usuario
   */
  async updateUserSettings(settings: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.put(`${environment.backendUrl}/api/whatsapp/user-settings`, settings, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener estadísticas
   */
  async getStats(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener estadísticas detalladas
   */
  async getDetailedStats(period: string = '30'): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/stats?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener reporte de rendimiento
   */
  async getPerformanceReport(period: string = '30', format: string = 'json'): Promise<any> {
    const token = localStorage.getItem('token');

    // Si el formato es texto, especificar responseType como 'text'
    const options: any = {
      headers: { Authorization: `Bearer ${token}` }
    };

    if (format === 'text') {
      options.responseType = 'text';
    }

    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/performance-report?period=${period}&format=${format}`, options).toPromise();
    return response;
  }

  /**
   * Obtener estadísticas simples (compatibilidad)
   */
  async getSimpleStats(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/stats/simple`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener historial de notificaciones
   */
  async getNotificationHistory(params?: any): Promise<any> {
    const token = localStorage.getItem('token');

    let queryParams = '';
    if (params) {
      const searchParams = new URLSearchParams();
      if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
      if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());
      if (params.status) searchParams.set('status', params.status);
      if (params.user) searchParams.set('user', params.user);
      if (params.type) searchParams.set('type', params.type);
      queryParams = searchParams.toString() ? '?' + searchParams.toString() : '';
    }

    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/history${queryParams}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener configuraciones globales del sistema
   */
  async getSystemSettings(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/global-config`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Guardar configuraciones globales del sistema
   */
  async saveSystemSettings(settings: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.put(`${environment.backendUrl}/api/whatsapp/global-config`, settings, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener plantillas de mensajes WhatsApp
   */
  async getTemplates(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/templates`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Guardar plantillas de mensajes WhatsApp
   */
  async saveTemplates(templates: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/templates`, { templates }, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }
}
