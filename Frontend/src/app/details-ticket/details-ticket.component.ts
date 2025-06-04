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

import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, TemplateRef, LOCALE_ID, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location, registerLocaleData } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TextFieldModule } from '@angular/cdk/text-field';
import { TicketService } from '../shared/services/ticket.service';
import { AuthService } from '../shared/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { UserService } from '../shared/services/user.service';
import { environment } from '../../environments/environment';
import localeEs from '@angular/common/locales/es';
import { forkJoin, map, catchError, of, finalize, Subscription, switchMap, tap } from 'rxjs';

registerLocaleData(localeEs, 'es');

@Component({
  selector: 'app-details-ticket',
  standalone: true,  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    TextFieldModule
  ],providers: [
    { provide: LOCALE_ID, useValue: 'es' }
  ],
  templateUrl: './details-ticket.component.html',  styleUrls: ['./details-ticket.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DetailsTicketComponent implements OnInit, OnDestroy {
  @ViewChild('confirmDialog') confirmDialog!: TemplateRef<any>;
  ticket: any;
  messages: any[] = [];
  newMessage: string = '';
  selectedFiles: File[] = [];
  isDragging = false;
  userNames: Map<string, string> = new Map();
  userRole: string = '';
  technicians: any[] = [];  dialogRef!: MatDialogRef<any>;
  ticketLevelAttachments: any[] = [];
  isSendingMessage: boolean = false; // Flag para prevenir double-click
  private subscriptions: Subscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private ticketService: TicketService,
    private location: Location,
    public authService: AuthService,
    public userService: UserService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}  // Referencia a la función enlazada para poder eliminarla correctamente
  private boundRefreshHandler: any;

  // Método helper para obtener el ID del ticket actual de manera consistente
  private getCurrentTicketId(): string | null {
    return this.ticket?.id?.toString() || null;
  }

  ngOnInit(): void {
    // Suscribirse a los cambios de parámetros de la ruta para detectar navegación entre tickets
    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        const ticketId = params.get('id');
        if (ticketId) {
          // Cargar datos del nuevo ticket
          this.loadTicketDetails(ticketId);
        } else {
          console.error('No se encontró ID del ticket en la URL');
        }
      })
    );

    // Cargar técnicos una sola vez (no depende del ticket específico)
    this.loadTechnicians();

    // Crear una referencia enlazada a la función para poder eliminarla después
    this.boundRefreshHandler = this.handleTicketRefresh.bind(this);

    // Agregar listener para el evento de recarga desde notificaciones del mismo ticket
    window.addEventListener('refresh-ticket-details', this.boundRefreshHandler);
  }

  ngOnDestroy(): void {
    // Limpiar suscripciones para evitar fugas de memoria
    this.subscriptions.unsubscribe();

  // Eliminar el listener del evento de recarga usando la referencia guardada
    window.removeEventListener('refresh-ticket-details', this.boundRefreshHandler);
  }

  // Manejador para el evento de recarga desde notificaciones del mismo ticket
  handleTicketRefresh() {
    const currentTicketId = this.ticket?.id;
    if (currentTicketId) {
      this.loadTicketDetails(currentTicketId.toString());      // También recargar comentarios y otra información relacionada
      this.ticketService.getComments(currentTicketId.toString()).subscribe(comments => {
        this.messages = comments.reverse();
        this.loadUserNames();
        this.cdr.detectChanges();
      });
    }
  }
  // Modificar loadTicketDetails para aceptar ticketId como argumento
  loadTicketDetails(ticketId?: string): void {
    const id = ticketId || this.route.snapshot.paramMap.get('id');
    if (!id) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.userRole = this.authService.getUserRole() || '';

    // Usar forkJoin para coordinar múltiples llamadas
    this.subscriptions.add(
      forkJoin([
        this.ticketService.getTicketDetails(id),
        this.ticketService.getComments(id)
      ]).subscribe({
        next: ([ticket, comments]) => {
          this.ticket = ticket;
          if (this.ticket.created_at) {
            this.ticket.created_at = new Date(this.ticket.created_at);
          }          // Filtrar solo los adjuntos del ticket (sin comment_id)
          this.ticketLevelAttachments = (this.ticket.attachments || []).filter((att: any) => !att.comment_id);

          // Ordenar mensajes para mostrar los más recientes primero
          this.messages = comments.reverse();

          // Cargar nombres de usuarios una sola vez después de tener todos los datos
          this.loadUserNames();

          // Una única detección de cambios al final
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error al cargar detalles del ticket:', err);
        }
      })
    );
  }
  loadTechnicians(): void {
    this.subscriptions.add(
      this.userService.getUsers().subscribe({
        next: (users) => {
          this.technicians = users.filter(user => user.role === 'tech');
          this.cdr.markForCheck(); // Notificar al detector de cambios
        },
        error: (err) => {
          console.error('Error al cargar técnicos:', err);
          this.cdr.markForCheck();
        }
      })
    );
  }loadUserNames(): void {
    // Crear una lista de IDs única con verificación de valor indefinido
    const userIds = [];
    if (this.ticket && this.ticket.user_id) {
      userIds.push(this.ticket.user_id);
    }
    if (this.messages && this.messages.length > 0) {
      // Agregar IDs de mensajes solo si existen y son válidos
      this.messages.forEach(message => {
        if (message && message.user_id) {
          userIds.push(message.user_id);
        }
      });
    }

    // Eliminar duplicados
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return; // No hay usuarios para cargar
    }

    // Cargar todos los nombres de usuario en paralelo
    this.subscriptions.add(
      forkJoin(
        uniqueUserIds
          .filter(userId => userId && !this.userNames.has(userId))
          .map(userId =>
            this.userService.getUser(userId).pipe(
              map(user => ({
                userId,
                username: user ? `${user.firstname}` : 'Usuario Desconocido'
              }))
            )
          )
      ).subscribe({
        next: (results) => {
          // Actualizar todos los nombres de una vez
          results.forEach(result => {
            this.userNames.set(result.userId, result.username);
          });
          // Una sola actualización de la vista
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error al cargar nombres de usuarios:', err);
        }
      })
    );
  }  updateStatus(status: string): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.ticketService.updateTicketStatus(ticketId, status, this.userRole).subscribe({
      next: () => {
        // Actualizar el estado localmente
        this.ticket.status = status;

        // Recargar datos completos para obtener timestamps actualizados
        this.loadTicketDetails(ticketId);

        // Notificar la vista del cambio
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error(`❌ Frontend: Error al actualizar el estado del ticket a "${status}":`, error.message);
        this.cdr.markForCheck();
      },
    });
  }updatePriority(priority: string): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.ticketService.updateTicketPriority(ticketId, priority).subscribe({
      next: () => {
        // Actualizar prioridad localmente
        this.ticket.priority = priority;

        // Recargar datos completos
        this.loadTicketDetails(ticketId);

        // Notificar la vista del cambio
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error al actualizar la prioridad del ticket:', error.message);
        this.cdr.markForCheck();
      },
    });
  }  assignTechnician(assigned_to: number): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.ticketService.updateTicketTechnician(ticketId, assigned_to).subscribe({
      next: () => {
        // Actualizar localmente
        this.ticket.assigned_to = assigned_to;

        // Recargar datos para obtener toda la información actualizada
        this.loadTicketDetails(ticketId);

        // Notificar a la vista
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error al asignar el técnico al ticket:', error.message);
        this.cdr.markForCheck();
      },
      });
    }
  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'Baja':
        return 'priority-chip priority-low';
      case 'Media':
        return 'priority-chip priority-medium';
      case 'Alta':
        return 'priority-chip priority-high';
      case 'Urgente':
        return 'priority-chip priority-urgent';
      default:
        return 'priority-chip';
    }
  }
  sendMessage(): void {
    if ((this.newMessage.trim() || this.selectedFiles.length > 0) && !this.isSendingMessage) {
      this.isSendingMessage = true; // Prevenir double-click
      const ticketId = this.getCurrentTicketId();
      const userId = this.authService.getUserId();

      if (ticketId) {
        const formData = new FormData();
        formData.append('message', this.newMessage);
        if (userId) {
          formData.append('userId', userId);
        }

        this.selectedFiles.forEach(file => {
          formData.append('attachments', file, file.name);
        });        this.ticketService.sendMessage(ticketId, formData).subscribe({
          next: (comment) => {
            this.newMessage = '';
            this.selectedFiles = [];

            // Si el usuario es técnico, actualizar estado en la UI también
            if (this.userRole === 'tech' &&
                this.ticket &&
                this.ticket.status !== 'Cerrado' &&
                this.ticket.status !== 'Resuelto') {
              this.ticket.status = 'Esperando respuesta del usuario';
            }

            // Recargar detalles del ticket para asegurar sincronización con la BD
            this.loadTicketDetails(ticketId);
          },
          error: (error) => {
            console.error('Error al enviar el mensaje:', error);
            this.cdr.markForCheck();
          },
          complete: () => {
            this.isSendingMessage = false; // Restablecer flag al completar
            this.cdr.markForCheck();
          }
        });
      } else {
        this.isSendingMessage = false; // Restablecer flag si no hay ticketId
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
          this.updateStatus('Escalado a externo'); }
          else if (action === 'Escalar a Tier 3') {
          this.updateStatus('Escalado a Tier 3 / Gerente de Cuenta');
        }
      }
    });  }
  closeTicket(): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.subscriptions.add(
      this.ticketService.updateTicketStatus(ticketId, 'Cerrado', this.userRole).subscribe({
        next: () => {
          this.ticket.status = 'Cerrado';
          this.loadTicketDetails(ticketId); // Reflejar el cambio en la vista
          this.cdr.markForCheck();
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al cerrar el ticket:', error.message);
          this.cdr.markForCheck();
        }
      })
    );  }
  resolveTicket(): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    this.subscriptions.add(
      this.ticketService.updateTicketStatus(ticketId, 'Resuelto', this.userRole).subscribe({
        next: () => {
          this.ticket.status = 'Resuelto';
          this.loadTicketDetails(ticketId); // Reflejar el cambio en la vista
          this.cdr.markForCheck();
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error al resolver el ticket:', error.message);
          this.cdr.markForCheck();
        }
      })
    );  }  uncloseTicket(): void {
    const ticketId = this.getCurrentTicketId();
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }

    // Preparar el título con prefijo REABIERTO
    const originalTitle = this.ticket?.title || '';
    const newTitle = originalTitle.startsWith('REABIERTO')
      ? originalTitle
      : 'REABIERTO ' + originalTitle;

    // Operaciones secuenciales con switchMap de rxjs
    this.subscriptions.add(
      // Primero actualizamos el título
      this.ticketService.updateTicketName(ticketId, newTitle).pipe(
        // Luego actualizamos el estado
        switchMap(() => {
          return this.ticketService.updateTicketStatus(ticketId, 'Esperando respuesta del usuario', this.userRole);
        }),
        // Manejo de errores mejorado
        catchError((error: any) => {
          console.error('Error al reabrir el ticket:', error);
          if (error.status) {
            console.error('Código de estado:', error.status, error.statusText);
          }
          if (error.error) {
            console.error('Mensaje del servidor:', error.error);
          }
          this.cdr.markForCheck();
          return of(null); // Continuar con el flujo para evitar error fatal
        }),
        // Asegurar que siempre se ejecute markForCheck
        finalize(() => {
          this.loadTicketDetails(ticketId);
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: () => {},

        error: (err) => {
          console.error('Error en la suscripción de reapertura:', err);
        }
      })
    );
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
        return 'status-chip status-created';
      case 'En gestión':
        return 'status-chip status-in-progress';
      case 'Esperando respuesta del usuario':
        return 'status-chip status-in-user';
      case 'Escalado a externo':
        return 'status-chip status-escalated';
      case 'Escalado a Tier 3 / Gerente de Cuenta':
        return 'status-chip status-tier3';
      case 'Resuelto':
      case 'Cerrado':
        return 'status-chip status-closed';
      default:
        return 'status-chip';
    }
  }

  areNumber(userId: string, loggedInUserId: string): boolean {
    const userIdNumber = Number(userId);
    const loggedInUserIdNumber = Number(loggedInUserId);
    return userIdNumber === loggedInUserIdNumber;
  }

  getUserName(userId: string): string {
    return this.userNames.get(userId) || 'Sin Asignar';
  }  // Devuelve la URL absoluta para un adjunto
  getAttachmentUrl(attachment: any): string {
    if (!attachment?.filepath) return '';
    if (attachment.filepath.startsWith('http')) {
      return attachment.filepath;
    }
    return `${environment.backendUrl}${attachment.filepath}`;
  }

  // Devuelve la URL para forzar descarga de un archivo
  getDownloadUrl(attachment: any): string {
    if (!attachment?.filepath) return '';
    const filename = attachment.filepath.split('/').pop();
    return `${environment.backendUrl}/download/${filename}`;
  }

  // Obtiene las iniciales del nombre de usuario para mostrar en el avatar
  getUserInitials(name: string | undefined): string {
    if (!name) return '?';
    return name.split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  // Función para convertir saltos de línea en elementos HTML
  formatMessageWithLineBreaks(message: string): string {
    if (!message) return '';
    return message.replace(/\n/g, '<br>');
  }

  // Función para descargar archivos adjuntos
  downloadAttachment(attachment: any): void {
    const url = this.getDownloadUrl(attachment);
    window.open(url, '_blank');
  }

  // Función para manejar el pegado en el textarea
  onPaste(event: ClipboardEvent): void {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Verificar si es una imagen
      if (item.type.startsWith('image/')) {
        event.preventDefault(); // Prevenir el pegado normal

        const file = item.getAsFile();
        if (file) {
          // Generar un nombre único para la imagen pegada
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const extension = this.getFileExtensionFromMimeType(file.type);
          const fileName = `pasted-image-${timestamp}.${extension}`;

          // Crear un nuevo archivo con el nombre personalizado
          const renamedFile = new File([file], fileName, { type: file.type });

          // Agregar a la lista de archivos seleccionados
          this.selectedFiles.push(renamedFile);

          // Actualizar la vista
          this.cdr.markForCheck();
        }
      }
    }
  }

  // Función para obtener la extensión de archivo desde el tipo MIME
  getFileExtensionFromMimeType(mimeType: string): string {
    const mimeToExtension: { [key: string]: string } = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/webp': 'webp',
      'image/svg+xml': 'svg'
    };

    return mimeToExtension[mimeType] || 'png';
  }

  // Función para manejar el arrastre sobre el textarea
  onTextareaDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }
  // Función para manejar cuando se suelta algo en el textarea
  onTextareaDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // Agregar todos los archivos soltados
      for (let i = 0; i < files.length; i++) {
        this.selectedFiles.push(files[i]);
      }
      this.cdr.markForCheck();
    }
  }
  // Método para ver un adjunto en una nueva pestaña
  viewAttachment(attachment: any): void {
    const url = this.getAttachmentUrl(attachment);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // Función para limpiar el formulario de nuevo mensaje
  clearMessage(): void {
    this.newMessage = '';
    this.selectedFiles = [];
    this.cdr.markForCheck();
  }
}
