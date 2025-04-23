import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TicketService } from '../ticket.service';
import { AuthService } from '../auth.service';
import { MatCardModule } from '@angular/material/card';
import { UserService } from '../user.service';

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
    RouterModule
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

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private router: Router,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';
    this.loadTickets();
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
      this.loadUserNames();
      this.loadTechNames();
      this.applyFilters(); // Aplicar filtros después de cargar los tickets
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
        (this.filters.status === 'abiertos' && ticket.status !== 'Cerrado' && ticket.status !== 'Resuelto') ||
        (this.filters.status === 'cerrados' && (ticket.status === 'Cerrado' || ticket.status === 'Resuelto'));

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
      status: 'todos', // Restablecer el filtro de estado a "todos"
      orderBy: 'fecha', // Restablecer el orden a "fecha"
      assignedTo: 'todos', // Restablecer el filtro de asignado a "todos"
      startDate: '', // Limpiar la fecha de inicio
      endDate: '' // Limpiar la fecha final
    };
    this.applyFilters(); // Reaplicar los filtros
  }
}
