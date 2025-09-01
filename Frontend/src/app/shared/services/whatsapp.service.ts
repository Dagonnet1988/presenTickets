/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa por Diego Sánchez.
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
export class WhatsappService {

  constructor(private http: HttpClient) { }

  /**
   * Obtener estadísticas anti-bloqueo
   */
  async getAntiBlockStats(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/anti-block-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener uso horario de mensajes
   */
  async getHourlyUsage(days: string): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/hourly-usage?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Configurar límites de rate limiting
   */
  async configureLimits(limits: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/configure-limits`, limits, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener estado de WhatsApp
   */
  async getStatus(): Promise<any> {
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
  async testMessage(phone: string): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/test-message`, {
      phone_number: phone
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
   * Guardar configuración del usuario
   */
  async saveUserSettings(settings: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.put(`${environment.backendUrl}/api/whatsapp/user-settings`, settings, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener estadísticas
   */
  async getStats(period: string = '7'): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/stats?period=${period}`, {
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
   * Generar reporte de rendimiento
   */
  async generatePerformanceReport(period: string = '30', format: string = 'json'): Promise<any> {
    const token = localStorage.getItem('token');
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
   * Obtener historial de notificaciones con filtros
   */
  async getNotificationHistory(
    page: number = 0,
    limit: number = 50,
    search?: string,
    status?: string,
    type?: string,
    user?: string
  ): Promise<any> {
    const token = localStorage.getItem('token');
    let queryParams = `?page=${page}&limit=${limit}`;

    if (search && search.trim()) {
      queryParams += `&search=${encodeURIComponent(search.trim())}`;
    }

    if (status && status !== 'all') {
      queryParams += `&status=${encodeURIComponent(status)}`;
    }

    if (type && type !== 'all') {
      queryParams += `&type=${encodeURIComponent(type)}`;
    }

    if (user && user.trim()) {
      queryParams += `&user=${encodeURIComponent(user.trim())}`;
    }

            const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/history${queryParams}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener configuración global
   */
  async getGlobalConfig(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/global-settings`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Obtener estado de conexión (alias para getStatus)
   */
  async getConnectionStatus(): Promise<any> {
    return this.getStatus();
  }

  /**
   * Enviar mensaje de prueba (alias para testMessage)
   */
  async sendTestMessage(phone: string): Promise<any> {
    return this.testMessage(phone);
  }

  /**
   * Actualizar configuración de usuario (alias para saveUserSettings)
   */
  async updateUserSettings(settings: any): Promise<any> {
    return this.saveUserSettings(settings);
  }

  /**
   * Obtener reporte de rendimiento (alias para generatePerformanceReport)
   */
  async getPerformanceReport(period: string = '30', format: string = 'json'): Promise<any> {
    return this.generatePerformanceReport(period, format);
  }

  /**
   * Obtener configuración del sistema (alias para getGlobalConfig)
   */
  async getSystemSettings(): Promise<any> {
    return this.getGlobalConfig();
  }

  /**
   * Guardar configuración del sistema (alias para saveGlobalConfig)
   */
  async saveSystemSettings(settings: any): Promise<any> {
    return this.saveGlobalConfig(settings);
  }

  /**
   * Obtener horarios laborales
   */
  async getBusinessHours(): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.get(`${environment.backendUrl}/api/whatsapp/business-hours`, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }

  /**
   * Guardar configuración global
   */
  async saveGlobalConfig(settings: any): Promise<any> {
    const token = localStorage.getItem('token');
    const response = await this.http.post(`${environment.backendUrl}/api/whatsapp/global-settings`, settings, {
      headers: { Authorization: `Bearer ${token}` }
    }).toPromise();
    return response;
  }
}
