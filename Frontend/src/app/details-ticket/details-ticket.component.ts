import { Component, OnInit, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TicketService } from '../ticket.service';
import { AuthService } from '../auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { UserService } from '../user.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-details-ticket',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule
  ],
  templateUrl: './details-ticket.component.html',
  styleUrls: ['./details-ticket.component.css'],
})
export class DetailsTicketComponent implements OnInit {
  @ViewChild('confirmDialog') confirmDialog!: TemplateRef<any>;
  ticket: any;
  messages: any[] = [];
  newMessage: string = '';
  selectedFiles: File[] = [];
  isDragging = false;
  userNames: Map<string, string> = new Map();
  userRole: string = '';
  technicians: any[] = [];
  dialogRef!: MatDialogRef<any>;
  ticketLevelAttachments: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private ticketService: TicketService,
    private location: Location,
    public authService: AuthService,
    public userService: UserService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Suscribirse a los cambios de parámetro 'id' para recargar el ticket si cambia
    this.route.paramMap.subscribe(params => {
      const ticketId = params.get('id');
      if (ticketId) {
        this.loadTicketDetails(ticketId);
      }
    });
    this.loadTechnicians();
  }

  // Modificar loadTicketDetails para aceptar ticketId como argumento
  loadTicketDetails(ticketId?: string): void {
    const id = ticketId || this.route.snapshot.paramMap.get('id');
    if (id) {
      this.userRole = this.authService.getUserRole() || '';
      this.ticketService.getTicketDetails(id).subscribe(ticket => {
        this.ticket = ticket;
        this.ticket.created_at = new Date(this.ticket.created_at);
        // Filtrar solo los adjuntos del ticket (sin comment_id)
        this.ticketLevelAttachments = (this.ticket.attachments || []).filter((att: any) => !att.comment_id);
        this.cdr.detectChanges();
        this.loadUserNames();
      });

      this.ticketService.getComments(id).subscribe(comments => {
        this.messages = comments;
        this.loadUserNames();
        this.cdr.detectChanges(); // Forzar detección después de cargar mensajes
      });
    }
  }

  loadTechnicians(): void {
    this.userService.getUsers().subscribe(users => {
      this.technicians = users.filter(user => user.role === 'tech');
    });
  }

  loadUserNames(): void {
    const userIds = [this.ticket.user_id, ...new Set(this.messages.map(message => message.user_id))];
    userIds.forEach(userId => {
      if (!this.userNames.has(userId)) {
        this.userService.getUser(userId).subscribe(user => {
          const username = user?.firstname +' '+ user?.lastname || 'Usuario Desconocido';
          this.userNames.set(userId, username);
          this.cdr.detectChanges(); // Forzar detección de cambios para nombres de usuario
        });
      }
    });
  }

  updateStatus(status: string): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketStatus(ticketId, status, this.userRole).subscribe({
        next: () => {
          this.ticket.status = status;
          this.cdr.detectChanges(); // Forzar detección de cambios
          this.loadTicketDetails(); // Recargar detalles del ticket
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al actualizar el estado del ticket:', error.message);
        },
      });
    }
  }

  updatePriority(priority: string): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketPriority(ticketId, priority ).subscribe({
        next: () => {
          this.ticket.priority = priority;
          this.cdr.detectChanges(); // Forzar detección de cambios
          this.loadTicketDetails(); // Recargar detalles del ticket
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al actualizar la prioridad del ticket:', error.message);
        },
      });
    }
  }

  assignTechnician(assigned_to: number): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketTechnician(ticketId, assigned_to ).subscribe({
        next: () => {
          this.ticket.assigned_to = assigned_to;
          this.cdr.detectChanges(); // Forzar detección de cambios
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al asignar el técnico al ticket:', error.message);
        },
      });
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


  sendMessage(): void {
    if (this.newMessage.trim() || this.selectedFiles.length > 0) {
      const ticketId = this.route.snapshot.paramMap.get('id');
      const userId = this.authService.getUserId();

      if (ticketId) {
        const formData = new FormData();
        formData.append('message', this.newMessage);
        if (userId) {
          formData.append('userId', userId);
        }

        this.selectedFiles.forEach(file => {
          formData.append('attachments', file, file.name);
        });

        this.ticketService.sendMessage(ticketId, formData).subscribe(comment => {
          this.newMessage = '';
          this.selectedFiles = [];
          this.loadTicketDetails(); // Recargar detalles del ticket
        });
      }
    }
  }

  onFileSelected(event: any): void {
    if (event.target.files && event.target.files.length) {
      this.selectedFiles.push(...Array.from(event.target.files as File[]));
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files && event.dataTransfer.files.length) {
      this.selectedFiles.push(...Array.from(event.dataTransfer.files));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  removeAttachment(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString();
  }

  goBack(): void {
    this.location.back();
  }

  confirmAction(action: string): void {
    this.dialogRef = this.dialog.open(this.confirmDialog, {
      data: { action }
    });

    this.dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (action === 'cerrar') {
          this.closeTicket();
        } else if (action === 'resolver') {
          this.resolveTicket();
        } else if (action === 'reabrir') {
          this.uncloseTicket();
        } else if (action === 'Escalar a Externo') {
          this.updateStatus('Escalado a externo');
        } else if (action === 'Escalar a Tier 3 / Gerente de Cuenta') {
          this.updateStatus('Escalado a Tier 3 / Gerente de Cuenta');
        }
      }
    });
  }

  closeTicket(): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketStatus(ticketId, 'Cerrado', this.userRole).subscribe({
        next: () => {
          this.ticket.status = 'Cerrado';
          this.loadTicketDetails(); // Reflejar el cambio en la vista
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al cerrar el ticket:', error.message);
        },
      });
    }
  }

  resolveTicket(): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketStatus(ticketId, 'Resuelto', this.userRole).subscribe({
        next: () => {
          this.ticket.status = 'Resuelto';
          this.loadTicketDetails(); // Reflejar el cambio en la vista
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al resolver el ticket:', error.message);
        },
      });
    }
  }

  uncloseTicket(): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.ticketService.updateTicketStatus(ticketId, 'Esperando respuesta del usuario', this.userRole).subscribe({
        next: () => {
          this.ticket.status = 'Esperando respuesta';
          this.loadTicketDetails(); // Reflejar el cambio en la vista
        }
      });
      this.ticketService.updateTicketName(ticketId, 'REABIERTO ').subscribe({
        next: () => {
          this.ticket.title = 'REABIERTO ' + this.ticket.name;
          this.loadTicketDetails(); // Reflejar el cambio en la vista
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al reabrir el ticket:', error.message);
        },
      });
    }
  }

  isImage(fileName: string): boolean {
    return /\.(jpg|jpeg|png|gif|bmp|svg|webp)$/i.test(fileName);
  }

  getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'SIN EXTENSIÓN';
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

  areNumber(userId: string, loggedInUserId: string): boolean {
    const userIdNumber = Number(userId);
    const loggedInUserIdNumber = Number(loggedInUserId);
    return userIdNumber === loggedInUserIdNumber;
  }

  getUserName(userId: string): string {
    return this.userNames.get(userId) || 'Sin Asignar';
  }

  // Devuelve la URL absoluta para un adjunto
  getAttachmentUrl(attachment: any): string {
    if (!attachment?.filepath) return '';
    if (attachment.filepath.startsWith('http')) {
      return attachment.filepath;
    }
    return `${environment.backendUrl}${attachment.filepath}`;
  }
}
