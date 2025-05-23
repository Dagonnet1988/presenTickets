import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

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
    return this.http.post<any>(this.apiUrl, ticketData, { headers: this.getAuthHeaders() });
  }

  sendMessage(ticketId: string, formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrlComments}/${ticketId}`, formData, { headers: this.getAuthHeaders() });
  }

  updateTicketStatus(ticketId: string, status: string, actorRole: string): Observable<any> {
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
