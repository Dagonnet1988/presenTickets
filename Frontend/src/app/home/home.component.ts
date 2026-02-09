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
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, registerLocaleData } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TicketService } from '../shared/services/ticket.service';
import { AuthService } from '../shared/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { UserService } from '../shared/services/user.service';
import { RefreshTicketsService } from '../shared/services/refresh-tickets.service';
import { ExportDialogComponent, ExportColumn, ExportDialogResult } from './export-dialog/export-dialog.component';
import * as ExcelJS from 'exceljs';
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
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: MAT_DATE_LOCALE, useValue: 'es-ES' },
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
    endDate: '',
    datePeriod: 'all' // 'all', '7days', '30days', '90days', 'custom'
  };
  userNames: { [key: string]: string } = {};
  techNames: { [key: string]: string } = {};
  userRole: string = '';
  showAllTickets: boolean = false;
  techTicketView: string = 'mine'; // 'mine' o 'all' - para el selector de técnicos
  isExporting: boolean = false; // Bandera para indicar exportación en progreso

  // Contadores de tickets por estado
  countEscaladoExterno = 0;
  countEscaladoTier3 = 0;
  countEnGestion = 0;
  countEsperandoUsuario = 0;

  // Filtro de estado activo para los botones de conteo
  activeStatusFilter: string | null = null;

  // Bandera para saber si se restauraron filtros desde sessionStorage
  private hasRestoredFilters: boolean = false;

  // Clave para localStorage de filtros persistentes
  private readonly FILTERS_STORAGE_KEY = 'homeFiltersPersistent';

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private refreshTicketsService: RefreshTicketsService,
    private dialog: MatDialog
  ) {
    this.refreshTicketsService.refresh$.subscribe(() => {
      this.refreshTickets();
    });
  }

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';

    // Restaurar filtros (primero sessionStorage, luego localStorage)
    this.restoreFiltersFromUrl();

    this.loadTickets();
    this.loadUserNames(); // <--- Asegura que se carguen los nombres de usuario/asignado

    // Cargar técnicos para el filtro "Asignado a" (solo admin lo usa pero se carga para todos)
    if (this.userRole === 'admin') {
      this.loadTechNames();
    }
  }

  /**
   * Restaurar filtros desde sessionStorage (navegación interna) o localStorage (refresh)
   */
  private restoreFiltersFromUrl(): void {
    // Primero intentar restaurar desde sessionStorage (guardado al ir a detalles)
    const savedFilters = sessionStorage.getItem('homeFilters');

    if (savedFilters) {
      try {
        const params = JSON.parse(savedFilters);

        if (params.search) this.searchQuery = params.search;
        if (params.status) this.filters.status = params.status;
        if (params.orderBy) this.filters.orderBy = params.orderBy;
        if (params.assignedTo) this.filters.assignedTo = params.assignedTo;
        if (params.startDate) this.filters.startDate = params.startDate;
        if (params.endDate) this.filters.endDate = params.endDate;
        if (params.datePeriod) this.filters.datePeriod = params.datePeriod;
        if (params.page) this.currentPage = parseInt(params.page, 10) || 1;
        if (params.activeStatus) this.activeStatusFilter = params.activeStatus;
        if (params.showAll === 'true') this.showAllTickets = true;
        if (params.techView) this.techTicketView = params.techView;
        // Sincronizar techTicketView con showAllTickets
        if (this.showAllTickets) this.techTicketView = 'all';

        // Marcar que se restauraron filtros (para preservar la página en applyFilters)
        this.hasRestoredFilters = true;

        // Limpiar sessionStorage después de restaurar
        sessionStorage.removeItem('homeFilters');
        return; // Ya restauramos desde sessionStorage, no continuar
      } catch (e) {
        console.error('Error al restaurar filtros desde sessionStorage:', e);
        sessionStorage.removeItem('homeFilters');
      }
    }

    // Si no hay sessionStorage, intentar restaurar desde localStorage (para refresh)
    this.restoreFiltersFromLocalStorage();
  }

  /**
   * Restaurar filtros desde localStorage (persisten al hacer refresh)
   * Nota: NO restaura la búsqueda, solo los filtros
   */
  private restoreFiltersFromLocalStorage(): void {
    try {
      const savedFilters = localStorage.getItem(this.FILTERS_STORAGE_KEY);
      if (savedFilters) {
        const params = JSON.parse(savedFilters);

        // Restaurar solo filtros, NO la búsqueda
        if (params.status) this.filters.status = params.status;
        if (params.orderBy) this.filters.orderBy = params.orderBy;
        if (params.assignedTo) this.filters.assignedTo = params.assignedTo;
        if (params.datePeriod) this.filters.datePeriod = params.datePeriod;
        if (params.startDate) this.filters.startDate = params.startDate;
        if (params.endDate) this.filters.endDate = params.endDate;
        if (params.activeStatus) this.activeStatusFilter = params.activeStatus;
        if (params.showAll === 'true') this.showAllTickets = true;
        if (params.techView) this.techTicketView = params.techView;
        if (this.showAllTickets) this.techTicketView = 'all';

        this.hasRestoredFilters = true;
      }
    } catch (e) {
      console.warn('Error al restaurar filtros desde localStorage:', e);
      localStorage.removeItem(this.FILTERS_STORAGE_KEY);
    }
  }

  /**
   * Guardar filtros en localStorage (para persistir al refresh)
   * Nota: NO guarda la búsqueda
   */
  private saveFiltersToLocalStorage(): void {
    try {
      const filtersToSave: any = {};

      // Solo guardar si son diferentes al default
      if (this.filters.status !== 'abiertos') filtersToSave.status = this.filters.status;
      if (this.filters.orderBy !== 'fecha') filtersToSave.orderBy = this.filters.orderBy;
      if (this.filters.assignedTo !== 'todos') filtersToSave.assignedTo = this.filters.assignedTo;
      if (this.filters.datePeriod !== 'all') filtersToSave.datePeriod = this.filters.datePeriod;
      if (this.filters.startDate) filtersToSave.startDate = this.filters.startDate;
      if (this.filters.endDate) filtersToSave.endDate = this.filters.endDate;
      if (this.activeStatusFilter) filtersToSave.activeStatus = this.activeStatusFilter;
      if (this.showAllTickets) filtersToSave.showAll = 'true';
      if (this.techTicketView !== 'mine') filtersToSave.techView = this.techTicketView;

      // Solo guardar si hay algo diferente al default
      if (Object.keys(filtersToSave).length > 0) {
        localStorage.setItem(this.FILTERS_STORAGE_KEY, JSON.stringify(filtersToSave));
      } else {
        // Si todo es default, limpiar localStorage
        localStorage.removeItem(this.FILTERS_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Error al guardar filtros en localStorage:', e);
    }
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
          : tickets.filter(ticket => {
              const hasAccess = !ticket.assigned_to ||
                              ticket.assigned_to === Number(userId) ||
                              (ticket.participants && Array.isArray(ticket.participants) && ticket.participants.includes(Number(userId)));
              return hasAccess;
            });
      } else {
        // Para usuarios normales
        this.tickets = tickets.filter(ticket => {
          const isCreator = ticket.user_id === Number(userId);
          const isParticipant = ticket.participants && Array.isArray(ticket.participants) && ticket.participants.includes(Number(userId));
          const hasAccess = isCreator || isParticipant;

          return hasAccess;
        });
      }

      this.updateStatusCounts();

      // Preservar página solo si se restauraron filtros desde sessionStorage
      this.applyFilters(this.hasRestoredFilters);
      this.hasRestoredFilters = false; // Resetear bandera después de usar

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
        this.userService.getUserBasic(userId).subscribe(user => {
          const username = user?.firstname || 'No Asignado';
          this.userNames[userId] = username; // Actualizar el objeto
          this.cdr.detectChanges(); // Forzar la detección de cambios
        });
      }
    });
  }

  loadTechNames(): void {
    this.userService.getTechnicians().subscribe(technicians => {
      technicians.forEach(tech => {
        const username = tech?.firstname;
        this.techNames[tech.id] = username; // Actualizar el objeto
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

  applyFilters(preservePage: boolean = false): void {
    // Resetear a página 1 cuando se aplican filtros (excepto al restaurar)
    if (!preservePage) {
      this.currentPage = 1;
    }

    // Guardar filtros en localStorage para persistencia al refresh
    this.saveFiltersToLocalStorage();

    this.filteredTickets = this.tickets.filter(ticket => {
      const query = this.searchQuery.toLowerCase();

      // Filtro por búsqueda en título, número de ticket, ID externo y descripción
      const matchesSearch = !query ||
        ticket.title?.toLowerCase().includes(query) ||
        ticket.id.toString().includes(query) ||
        (ticket.external_ticket_id && ticket.external_ticket_id.toLowerCase().includes(query)) ||
        (ticket.description && ticket.description.toLowerCase().includes(query));

      // Filtro por estado - siempre se aplica (Opción 2)
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
    this.techTicketView = this.showAllTickets ? 'all' : 'mine';
    this.loadTickets();
  }

  // Método para cambiar la vista de tickets del técnico
  onTechViewChange(): void {
    this.showAllTickets = this.techTicketView === 'all';
    this.loadTickets();
  }

  viewTicketDetails(ticketId: string): void {
    // Guardar estado actual de filtros en queryParams para restaurar al volver
    const queryParams: any = {};

    if (this.searchQuery) queryParams.search = this.searchQuery;
    if (this.filters.status !== 'abiertos') queryParams.status = this.filters.status;
    if (this.filters.orderBy !== 'fecha') queryParams.orderBy = this.filters.orderBy;
    if (this.filters.assignedTo !== 'todos') queryParams.assignedTo = this.filters.assignedTo;
    if (this.filters.startDate) queryParams.startDate = this.filters.startDate;
    if (this.filters.endDate) queryParams.endDate = this.filters.endDate;
    if (this.filters.datePeriod !== 'all') queryParams.datePeriod = this.filters.datePeriod;
    if (this.currentPage > 1) queryParams.page = this.currentPage;
    if (this.activeStatusFilter) queryParams.activeStatus = this.activeStatusFilter;
    if (this.showAllTickets) queryParams.showAll = 'true';
    if (this.techTicketView !== 'mine') queryParams.techView = this.techTicketView;

    // Guardar queryParams en sessionStorage para recuperarlos al volver
    sessionStorage.setItem('homeFilters', JSON.stringify(queryParams));

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
      case 'En revisión':
        return 'status-review';
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
    // Opción 2: Al buscar, cambiar filtro de estado a "todos" para ver todos los resultados
    // El usuario puede luego cambiar el filtro para refinar la búsqueda
    if (this.searchQuery.trim().length > 0 && this.filters.status !== 'todos') {
      this.filters.status = 'todos';
    }
    this.applyFilters();
  }

  // Método para cambiar el período de fechas
  onDatePeriodChange(): void {
    const today = new Date();

    switch (this.filters.datePeriod) {
      case '7days':
        this.filters.endDate = this.formatDateForInput(today);
        this.filters.startDate = this.formatDateForInput(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
        break;
      case '30days':
        this.filters.endDate = this.formatDateForInput(today);
        this.filters.startDate = this.formatDateForInput(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
        break;
      case '90days':
        this.filters.endDate = this.formatDateForInput(today);
        this.filters.startDate = this.formatDateForInput(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000));
        break;
      case 'custom':
        // No cambiar fechas, el usuario las seleccionará
        break;
      default: // 'all'
        this.filters.startDate = '';
        this.filters.endDate = '';
        break;
    }
    this.applyFilters();
  }

  // Formatear fecha para input type="date"
  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Contar filtros activos (para mostrar chip "X filtros activos")
  getActiveFiltersCount(): number {
    let count = 0;

    // Búsqueda activa
    if (this.searchQuery.trim().length > 0) count++;

    // Estado diferente al default (abiertos)
    if (this.filters.status !== 'abiertos') count++;

    // Período diferente al default (all)
    if (this.filters.datePeriod !== 'all') count++;

    // Ordenar diferente al default (fecha)
    if (this.filters.orderBy !== 'fecha') count++;

    // Asignado diferente al default (todos)
    if (this.filters.assignedTo !== 'todos') count++;

    // Filtro de estado activo (botones de conteo)
    if (this.activeStatusFilter) count++;

    // Ver todos los tickets (tech)
    if (this.showAllTickets) count++;

    return count;
  }

  // Verificar si hay filtros activos (excluyendo búsqueda)
  hasActiveFilters(): boolean {
    return this.filters.status !== 'abiertos' ||
           this.filters.datePeriod !== 'all' ||
           this.filters.orderBy !== 'fecha' ||
           this.filters.assignedTo !== 'todos' ||
           this.activeStatusFilter !== null ||
           this.showAllTickets;
  }

  // Limpiar solo el texto de búsqueda (sin afectar filtros)
  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  // Limpiar solo los filtros (sin afectar búsqueda)
  resetFiltersOnly(): void {
    this.currentPage = 1;
    this.activeStatusFilter = null;
    this.showAllTickets = false;
    this.techTicketView = 'mine';
    this.filters = {
      status: 'abiertos',
      orderBy: 'fecha',
      assignedTo: 'todos',
      startDate: '',
      endDate: '',
      datePeriod: 'all'
    };
    // Limpiar localStorage de filtros persistentes
    localStorage.removeItem(this.FILTERS_STORAGE_KEY);
    // Mantener la búsqueda actual y recargar
    if (this.searchQuery.trim()) {
      this.applyFilters();
    } else {
      this.loadTickets();
    }
  }

  resetFilters(): void {
    this.searchQuery = ''; // Limpiar la barra de búsqueda
    this.currentPage = 1; // Resetear a página 1
    this.activeStatusFilter = null; // Limpiar filtro de estado activo
    this.showAllTickets = false; // Resetear vista de técnico
    this.techTicketView = 'mine'; // Resetear selector de técnico
    this.filters = {
      status: 'abiertos', // Restablecer el filtro de estado a "abiertos"
      orderBy: 'fecha', // Restablecer el orden a "fecha"
      assignedTo: 'todos', // Restablecer el filtro de asignado a "todos"
      startDate: '', // Limpiar la fecha de inicio
      endDate: '', // Limpiar la fecha final
      datePeriod: 'all' // Restablecer período a "todos"
    };
    // Limpiar localStorage de filtros persistentes
    localStorage.removeItem(this.FILTERS_STORAGE_KEY);
    this.loadTickets(); // Recargar tickets con la nueva configuración
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

  // ============================================
  // EXPORTACIÓN A EXCEL
  // ============================================

  /**
   * Abre el diálogo de exportación a Excel
   */
  openExportDialog(): void {
    const dialogRef = this.dialog.open(ExportDialogComponent, {
      width: '500px',
      data: {
        tickets: this.tickets, // Pasar TODOS los tickets (sin filtrar)
        userRole: this.userRole,
        userNames: this.userNames
      }
    });

    dialogRef.afterClosed().subscribe((result: ExportDialogResult | undefined) => {
      if (result && result.columns.length > 0 && result.tickets.length > 0) {
        this.exportToExcel(result.columns, result.tickets);
      }
    });
  }

  /**
   * Exporta los tickets a Excel
   */
  async exportToExcel(columns: ExportColumn[], ticketsToExport: any[]): Promise<void> {
    if (ticketsToExport.length === 0) {
      console.warn('No hay tickets para exportar');
      return;
    }

    this.isExporting = true;

    try {
      // Importación dinámica de file-saver
      const { saveAs } = await import('file-saver');

      // Crear libro de trabajo
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PresenTickets';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Tickets');

      // Configurar columnas
      worksheet.columns = columns.map(col => ({
        header: col.label,
        key: col.key,
        width: col.width || 15
      }));

      // Agregar datos
      ticketsToExport.forEach(ticket => {
        const row: any = {};

        columns.forEach(col => {
          switch (col.key) {
            case 'id':
              row[col.key] = ticket.id;
              break;
            case 'title':
              row[col.key] = ticket.title || '';
              break;
            case 'description':
              row[col.key] = ticket.description || '';
              break;
            case 'status':
              row[col.key] = ticket.status || '';
              break;
            case 'area':
              row[col.key] = ticket.area || '';
              break;
            case 'priority':
              row[col.key] = ticket.priority || '';
              break;
            case 'created_at':
              row[col.key] = ticket.created_at ? this.formatDateForExcel(ticket.created_at) : '';
              break;
            case 'closed_at':
              row[col.key] = ticket.closed_at ? this.formatDateForExcel(ticket.closed_at) : '';
              break;
            case 'external_ticket_id':
              row[col.key] = ticket.external_ticket_id || '';
              break;
            case 'user_name':
              row[col.key] = this.getUserName(ticket.user_id) || '';
              break;
            case 'assigned_to_name':
              row[col.key] = this.getUserName(ticket.assigned_to) || 'Sin asignar';
              break;
            case 'resolution_time':
              row[col.key] = this.calculateResolutionTime(ticket) || '';
              break;
            default:
              row[col.key] = ticket[col.key] || '';
          }
        });

        worksheet.addRow(row);
      });

      // Estilizar encabezados
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1976D2' } // Azul Material
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 25;

      // Estilizar todas las celdas de datos
      for (let i = 2; i <= ticketsToExport.length + 1; i++) {
        const row = worksheet.getRow(i);
        row.alignment = { vertical: 'middle', wrapText: true };

        // Alternar colores de fondo para mejor legibilidad
        if (i % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
          };
        }
      }

      // Agregar bordes a todas las celdas
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
        });
      });

      // Generar buffer y descargar
      const buffer = await workbook.xlsx.writeBuffer();
      const data = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const fileName = `tickets_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(data, fileName);

      this.isExporting = false;
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      this.isExporting = false;
    }
  }

  /**
   * Formatea fecha para Excel
   */
  private formatDateForExcel(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  /**
   * Calcula el tiempo de resolución de un ticket
   */
  private calculateResolutionTime(ticket: any): string {
    if (!ticket.closed_at || !ticket.created_at) return '';

    const created = new Date(ticket.created_at);
    const closed = new Date(ticket.closed_at);
    const diffMs = closed.getTime() - created.getTime();

    if (diffMs < 0) return '';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;

    if (diffDays > 0) {
      return `${diffDays}d ${remainingHours}h`;
    }
    return `${diffHours}h`;
  }
}
