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

import { Component, OnInit, ChangeDetectorRef, LOCALE_ID } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, registerLocaleData } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { TicketService } from '../shared/services/ticket.service';
import { AuthService } from '../shared/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { UserService } from '../shared/services/user.service';
import { RefreshTicketsService } from '../shared/services/refresh-tickets.service';
import localeEs from '@angular/common/locales/es';

registerLocaleData(localeEs, 'es');

// Formato de fecha personalizado para dd/mm/yyyy
export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'DD/MM/YYYY',
  },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

// DateAdapter personalizado para formato dd/mm/yyyy
export class CustomDateAdapter extends DateAdapter<Date> {
  override format(date: Date, displayFormat: Object): string {
    if (displayFormat === 'DD/MM/YYYY') {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    return date.toDateString();
  }

  override parse(value: any): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const parts = value.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    return null;
  }

  // Implementaciones requeridas por DateAdapter
  getYear(date: Date): number { return date.getFullYear(); }
  getMonth(date: Date): number { return date.getMonth(); }
  getDate(date: Date): number { return date.getDate(); }
  getDayOfWeek(date: Date): number { return date.getDay(); }
  getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  }
  getDateNames(): string[] {
    return Array.from({length: 31}, (_, i) => (i + 1).toString());
  }
  getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  }
  getYearName(date: Date): string { return date.getFullYear().toString(); }
  getFirstDayOfWeek(): number { return 1; }
  getNumDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
  clone(date: Date): Date { return new Date(date.getTime()); }
  createDate(year: number, month: number, date: number): Date {
    return new Date(year, month, date);
  }
  today(): Date { return new Date(); }
  addCalendarYears(date: Date, years: number): Date {
    return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
  }
  addCalendarMonths(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
  }
  addCalendarDays(date: Date, days: number): Date {
    return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
  }
  toIso8601(date: Date): string { return date.toISOString(); }
  isDateInstance(obj: any): boolean { return obj instanceof Date; }
  isValid(date: Date): boolean { return !isNaN(date.getTime()); }
  invalid(): Date { return new Date(NaN); }
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatIconModule,
    RouterModule,
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'es' }
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  tickets: any[] = [];
  filteredTickets: any[] = [];
  paginatedTickets: any[] = []; // Tickets visibles en la página actual
  ticketsPerPage: number = 20; // Número de tickets por página
  currentPage: number = 1; // Página actual
  totalPages: number = 1; // Total de páginas
  searchQuery: string = ''; // Texto de búsqueda
  filters = {
    status: 'abiertos',
    orderBy: 'fecha',
    assignedTo: 'todos',
    startDate: '',
    endDate: ''
  };
  userNames: { [key: string]: string } = {};
  techNames: { [key: string]: string } = {};
  userRole: string = '';
  showAllTickets: boolean = false;

  // Contadores de tickets por estado
  countEscaladoExterno = 0;
  countEscaladoTier3 = 0;
  countEnGestion = 0;
  countEsperandoUsuario = 0;

  // Filtro de estado activo para los botones de conteo
  activeStatusFilter: string | null = null;

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private router: Router,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private refreshTicketsService: RefreshTicketsService
  ) {
    this.refreshTicketsService.refresh$.subscribe(() => {
      this.refreshTickets();
    });
  }

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';
    this.loadTickets();
    this.loadUserNames(); // <--- Asegura que se carguen los nombres de usuario/asignado
  }

  updateStatusCounts(): void {
    this.countEscaladoExterno = this.tickets.filter(t => t.status === 'Escalado a externo').length;
    this.countEscaladoTier3 = this.tickets.filter(t => t.status === 'Escalado a Tier 3 / Gerente de Cuenta').length;
    this.countEnGestion = this.tickets.filter(t => t.status === 'En gestión').length;
    this.countEsperandoUsuario = this.tickets.filter(t => t.status === 'Esperando respuesta del usuario').length;
  }

  loadTickets(): void {
    const userId = this.authService.getUserId();
    this.ticketService.getTickets().subscribe(tickets => {
      if (this.userRole === 'admin') {
        this.tickets = tickets;
      } else if (this.userRole === 'tech') {
        this.tickets = this.showAllTickets
          ? tickets
          : tickets.filter(ticket => !ticket.assigned_to || ticket.assigned_to === Number(userId));
      } else {
        this.tickets = tickets.filter(ticket => ticket.user_id === Number(userId));
      }
      this.updateStatusCounts();
      this.applyFilters();
      this.loadUserNames(); // <--- Refresca los nombres después de cargar tickets
      this.cdr.detectChanges();
    }, error => {
      console.error('[HOME] Error al obtener tickets:', error);
    });
  }

  loadUserNames(): void {
    const userIds = [...new Set(this.tickets.map(ticket => ticket.assigned_to).concat(this.tickets.map(ticket => ticket.user_id)))];
    userIds.forEach(userId => {
      if (userId && !this.userNames[userId]) {
        this.userService.getUser(userId).subscribe(user => {
          const username = user?.firstname || 'No Asignado';
          this.userNames[userId] = username; // Actualizar el objeto
          this.cdr.detectChanges(); // Forzar la detección de cambios
        });
      }
    });
  }

  loadTechNames(): void {
    this.userService.getUsers().subscribe(users => {
      users.filter(user => user.role === 'tech').forEach(user => {
        const username = user?.firstname;
        this.techNames[user.id] = username; // Actualizar el objeto
      });
      this.cdr.detectChanges(); // Forzar la detección de cambios
    });
  }

  getUserName(userId: string): string {
    return this.userNames[userId] || 'Sin Asignar';
  }

  getTechName(userId: string): string {
    return this.techNames[userId] || 'Sin Asignar';
  }

  getTechNamesKeys(): string[] {
    return Object.keys(this.techNames); // Convertir las claves del objeto en un array
  }

  applyFilters(): void {
    this.filteredTickets = this.tickets.filter(ticket => {
      const query = this.searchQuery.toLowerCase();

      // Filtro por búsqueda en título y número de ticket
      const matchesSearch = this.searchQuery
        ? ticket.title?.toLowerCase().includes(query) || ticket.id.toString().includes(query)
        : true;

      // Filtro por estado
      const matchesStatus =
        this.filters.status === 'todos' ||
        (this.filters.status === 'abiertos' && ticket.status !== 'Cerrado' && ticket.status !== 'Resuelto'
          && ticket.status !== 'Escalado a Tier 3 / Gerente de Cuenta') ||
        (this.filters.status === 'cerrados' && (ticket.status === 'Cerrado' || ticket.status === 'Resuelto')) ||
        (this.filters.status === 'tier3' && ticket.status === 'Escalado a Tier 3 / Gerente de Cuenta') ||
        (this.filters.status === 'escaladoExterno' && ticket.status === 'Escalado a externo') ||
        (this.filters.status === 'enGestion' && ticket.status === 'En gestión') ||
        (this.filters.status === 'esperando' && ticket.status === 'Esperando respuesta del usuario');

      // Filtro por fecha
      const ticketDate = new Date(ticket.created_at);
      const startDate = this.filters.startDate ? new Date(this.filters.startDate + 'T00:00:00') : null;
      const endDate = this.filters.endDate ? new Date(this.filters.endDate + 'T23:59:59') : null;
      const matchesDate =
        (!startDate || ticketDate >= startDate) &&
        (!endDate || ticketDate <= endDate);

      // Filtro por asignado (solo para admin)
      const matchesAssigned =
        this.userRole !== 'admin' ||
        this.filters.assignedTo === 'todos' ||
        (this.filters.assignedTo === 'noAsignado' && !ticket.assigned_to) ||
        (this.filters.assignedTo !== 'noAsignado' && ticket.assigned_to === Number(this.filters.assignedTo));

      // Combinar todos los filtros
      const matches = matchesSearch && matchesStatus && matchesDate && matchesAssigned;

      return matches;
    });

    this.sortTickets();
    this.updatePagination();
    this.updateStatusCounts();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredTickets.length / this.ticketsPerPage);
    this.paginatedTickets = this.filteredTickets.slice(
      (this.currentPage - 1) * this.ticketsPerPage,
      this.currentPage * this.ticketsPerPage
    );
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages) return; // Validar que la página sea válida
    this.currentPage = page;
    this.updatePagination();
  }

  sortTickets(): void {
    if (this.filters.orderBy === 'estado') {
      this.filteredTickets.sort((a, b) => a.status.localeCompare(b.status));
    } else if (this.filters.orderBy === 'fecha') {
      this.filteredTickets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }

  toggleShowAllTickets(): void {
    this.showAllTickets = !this.showAllTickets;
    this.loadTickets();
  }

  viewTicketDetails(ticketId: string): void {
    this.router.navigate(['/ticket', ticketId]);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Fecha inválida';
    }
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: true
    };
    return date.toLocaleDateString('es-ES', options);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Creado':
        return 'status-created';
      case 'En gestión':
        return 'status-in-progress';
      case 'Esperando respuesta del usuario':
        return 'status-in-user';
      case 'Escalado a externo':
        return 'status-escalated';
      case 'Escalado a Tier 3 / Gerente de Cuenta':
        return 'status-tier3';
      case 'Resuelto':
      case 'Cerrado':
        return 'status-closed';
      default:
        return '';
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'Baja':
        return 'priority-low';
      case 'Media':
        return 'priority-medium';
      case 'Alta':
        return 'priority-high';
      case 'Urgente':
        return 'priority-urgent';
      default:
        return '';
    }
  }

  onSearchChange(): void {
    this.applyFilters(); // Reaplicar los filtros cuando cambie la búsqueda
  }

  resetFilters(): void {
    this.searchQuery = ''; // Limpiar la barra de búsqueda
    this.filters = {
      status: 'abiertos', // Restablecer el filtro de estado a "todos"
      orderBy: 'fecha', // Restablecer el orden a "fecha"
      assignedTo: 'todos', // Restablecer el filtro de asignado a "todos"
      startDate: '', // Limpiar la fecha de inicio
      endDate: '' // Limpiar la fecha final
    };
    this.applyFilters(); // Reaplicar los filtros
  }

  filterByStatus(status: string): void {
    // Unificar valores de estado para evitar inconsistencias
    // Normalizamos el valor recibido para que coincida con los valores de los tickets
    let normalizedStatus = status.trim();
    if (normalizedStatus === 'Escalado a Externo') normalizedStatus = 'Escalado a externo';
    if (normalizedStatus === 'Escalado a Tier 3' || normalizedStatus === 'Escalado a Tier 3 / Gerente de Cuenta') normalizedStatus = 'Escalado a Tier 3 / Gerente de Cuenta';

    if (this.activeStatusFilter === normalizedStatus) {
      // Si ya está seleccionado, quitar filtro
      this.activeStatusFilter = null;
      this.filters.status = 'abiertos';
    } else {
      this.activeStatusFilter = normalizedStatus;
      // Mapear el estado a la clave de filtro correspondiente
      switch (normalizedStatus) {
        case 'Esperando respuesta del usuario':
          this.filters.status = 'esperando';
          break;
        case 'Escalado a externo':
          this.filters.status = 'escaladoExterno';
          break;
        case 'Escalado a Tier 3 / Gerente de Cuenta':
          this.filters.status = 'tier3';
          break;
        case 'En gestión':
          this.filters.status = 'enGestion';
          break;
        default:
          this.filters.status = 'abiertos';
      }
    }
    this.applyFilters();
  }

  // Limpia el botón activo si el usuario cambia el select de estado manualmente
  onStatusSelectChange(): void {
    this.activeStatusFilter = null;
    this.applyFilters();
  }

  // Devuelve un rango de números de página para mostrar en la paginación
  getPaginationRange(): number[] {
    const pageRange: number[] = [];
    const delta = 2; // Número de páginas a ambos lados del actual

    // Diseño inteligente para mostrar páginas alrededor de la actual
    if (this.totalPages <= 7) {
      // Si hay 7 páginas o menos, mostrar todas
      for (let i = 2; i < this.totalPages; i++) {
        pageRange.push(i);
      }
    } else {
      // Si current es cercano al inicio
      if (this.currentPage < 5) {
        for (let i = 2; i <= 5; i++) {
          pageRange.push(i);
        }
      }
      // Si current es cercano al final
      else if (this.currentPage > this.totalPages - 4) {
        for (let i = this.totalPages - 4; i < this.totalPages; i++) {
          pageRange.push(i);
        }
      }
      // Si current está en el medio
      else {
        for (let i = this.currentPage - delta; i <= this.currentPage + delta; i++) {
          if (i > 1 && i < this.totalPages) {
            pageRange.push(i);
          }
        }
      }
    }

    return pageRange;
  }

  // Permite refrescar la lista de tickets desde fuera
  public refreshTickets(): void {
    this.loadTickets();
  }
}
