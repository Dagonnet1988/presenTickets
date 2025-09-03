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

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TicketService } from '../shared/services/ticket.service';
import { AuthService } from '../shared/services/auth.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-create-ticket',
  standalone: true,  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './create-ticket.component.html',
  styleUrls: ['./create-ticket.component.css']
})
export class CreateTicketComponent implements OnInit {
  ticketForm!: FormGroup;
  attachments: File[] = [];
  isDragging = false;
  isSubmitting = false; // Nueva propiedad para controlar el estado de envío

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private ticketService: TicketService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.ticketForm = this.fb.group({
      title: ['', [Validators.required]],
      description: ['', [Validators.required]],
      category: ['', [Validators.required]],
      area: ['', [Validators.required]]
    });
  }

  onFileChange(event: any): void {
    if (event.target.files && event.target.files.length) {
      const maxFileSize = 200 * 1024 * 1024; // 200 MB in bytes
      const files = Array.from(event.target.files as File[]);
      const oversizedFiles = files.filter(file => file.size > maxFileSize);

      if (oversizedFiles.length > 0) {
        this.snackBar.open('Uno o más archivos superan el tamaño máximo de 200 MB', 'Cerrar', {
          duration: 3000,
        });
      } else {
        this.attachments.push(...files);
      }
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files && event.dataTransfer.files.length) {
      this.attachments.push(...Array.from(event.dataTransfer.files as unknown as File[]));
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

  onSubmit(): void {
    if (this.ticketForm.valid && !this.isSubmitting) {
      this.isSubmitting = true; // Marcar como en proceso de envío
      const ticketData = this.ticketForm.value;
      const userId = this.authService.getUserId();

      if (userId === null) {
        console.error('User ID is null');
        this.isSubmitting = false; // Restablecer el estado
        return;
      }

      const userIdNumber = Number(userId);

      if (isNaN(userIdNumber)) {
        console.error('userId no es un número válido');
        this.isSubmitting = false; // Restablecer el estado
        return;
      }

      const formData = new FormData();
      formData.append('title', ticketData.title.toUpperCase());
      formData.append('description', ticketData.description);
      formData.append('category', ticketData.category);
      formData.append('area', ticketData.area);
      formData.append('status', 'Creado');
      formData.append('userId', userIdNumber.toString());

      this.attachments.forEach(file => formData.append('attachments', file));

      this.ticketService.createTicket(formData).subscribe(
        response => {
          this.snackBar.open('Ticket creado exitosamente', 'Cerrar', {
            duration: 3000,
          });
          this.router.navigate([`/ticket/${response.ticketId}`]);
        },
        error => {
          console.error('Error al crear el ticket:', error);
          this.snackBar.open('Error al crear el ticket', 'Cerrar', {
            duration: 3000,
          });
          this.isSubmitting = false; // Restablecer el estado en caso de error
        },
        () => {
          this.isSubmitting = false; // Restablecer el estado después de completar
        }
      );
    } else {
      console.log('Formulario inválido');
    }
  }

  removeAttachment(index: number): void {
    this.attachments.splice(index, 1);
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

          // Agregar a la lista de archivos adjuntos
          this.attachments.push(renamedFile);

          // Actualizar la vista
          this.cdr.markForCheck();

          // Mostrar notificación
          this.snackBar.open('Imagen agregada como adjunto', 'Cerrar', {
            duration: 2000,
          });
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
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff'
    };
    return mimeToExtension[mimeType] || 'png';
  }
}
