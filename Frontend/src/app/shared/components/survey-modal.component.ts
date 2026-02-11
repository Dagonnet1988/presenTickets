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

import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface SurveyDialogData {
  ticketId: number;
  ticketTitle: string;
  isRequired: boolean; // true = cierre obligatorio, false = ticket resuelto
}

export interface SurveyDialogResult {
  submitted: boolean;
  rating?: number;
  comment?: string;
}

@Component({
  selector: 'app-survey-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="survey-dialog">
      <div class="dialog-header">
        <mat-icon class="star-icon">star</mat-icon>
        <h2 mat-dialog-title>Califica nuestro servicio</h2>
      </div>

      <mat-dialog-content>
        <p class="ticket-info">Ticket: <strong>{{ data.ticketTitle }}</strong></p>

        <p class="question">¿Cómo calificarías la atención recibida?</p>

        <div class="stars-container">
          <button
            *ngFor="let star of [1, 2, 3, 4, 5]"
            type="button"
            class="star-button"
            [class.selected]="star <= selectedRating"
            [class.hovered]="star <= hoveredRating"
            (mouseenter)="hoveredRating = star"
            (mouseleave)="hoveredRating = 0"
            (click)="selectRating(star)"
            [attr.aria-label]="star + ' estrellas'">
            <mat-icon>{{ star <= (hoveredRating || selectedRating) ? 'star' : 'star_border' }}</mat-icon>
          </button>
        </div>

        <div class="rating-label" [class.visible]="selectedRating > 0">
          {{ getRatingLabel() }}
        </div>

        <mat-form-field appearance="outline" class="comment-field">
          <mat-label>Comentario adicional (opcional)</mat-label>
          <textarea
            matInput
            [(ngModel)]="comment"
            rows="3"
            maxlength="500"
            placeholder="Comparte tu experiencia..."></textarea>
          <mat-hint align="end">{{ comment.length }}/500</mat-hint>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="center">
        <button
          *ngIf="!data.isRequired"
          mat-stroked-button
          (click)="skip()"
          [disabled]="isSubmitting">
          Más tarde
        </button>
        <button
          mat-raised-button
          color="primary"
          [disabled]="selectedRating === 0 || isSubmitting"
          (click)="submit()">
          <mat-icon *ngIf="!isSubmitting">send</mat-icon>
          <mat-spinner *ngIf="isSubmitting" diameter="20"></mat-spinner>
          {{ isSubmitting ? 'Enviando...' : 'Enviar calificación' }}
        </button>
      </mat-dialog-actions>

      <p *ngIf="data.isRequired" class="required-note">
        <mat-icon>info</mat-icon>
        La calificación es requerida para cerrar el ticket
      </p>
    </div>
  `,
  styles: [`
    .survey-dialog {
      min-width: 350px;
      max-width: 450px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 0 8px;
      gap: 8px;
      border-bottom: 1px solid #f0f0f0;
    }

    .star-icon {
      color: #ffc107;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    h2 {
      color: #333;
      margin: 0;
      font-size: 1.25rem;
    }

    mat-dialog-content {
      padding: 20px 24px;
      text-align: center;
    }

    .ticket-info {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 16px;
    }

    .question {
      font-size: 1.1rem;
      color: #333;
      margin-bottom: 20px;
    }

    .stars-container {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .star-button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      transition: transform 0.2s ease;
    }

    .star-button:hover {
      transform: scale(1.2);
    }

    .star-button mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #ddd;
      transition: color 0.2s ease;
    }

    .star-button.selected mat-icon,
    .star-button.hovered mat-icon {
      color: #ffc107;
    }

    .rating-label {
      font-size: 0.95rem;
      color: #666;
      min-height: 24px;
      margin-bottom: 20px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .rating-label.visible {
      opacity: 1;
    }

    .comment-field {
      width: 100%;
    }

    mat-dialog-actions {
      border-top: 1px solid #f0f0f0;
      padding: 16px 24px;
      gap: 12px;
    }

    mat-dialog-actions button {
      min-width: 140px;
    }

    mat-dialog-actions button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    .required-note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #ff9800;
      padding: 8px 16px 16px;
      margin: 0;
    }

    .required-note mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `]
})
export class SurveyModalComponent implements OnInit {
  selectedRating = 0;
  hoveredRating = 0;
  comment = '';
  isSubmitting = false;

  private ratingLabels: { [key: number]: string } = {
    1: '😞 Muy malo',
    2: '😕 Malo',
    3: '😐 Regular',
    4: '😊 Bueno',
    5: '🤩 Excelente'
  };

  constructor(
    public dialogRef: MatDialogRef<SurveyModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SurveyDialogData
  ) {
    // Deshabilitar cierre por click fuera o ESC si es requerido
    if (data.isRequired) {
      dialogRef.disableClose = true;
    }
  }

  ngOnInit(): void {}

  selectRating(rating: number): void {
    this.selectedRating = rating;
  }

  getRatingLabel(): string {
    return this.ratingLabels[this.selectedRating] || '';
  }

  submit(): void {
    if (this.selectedRating === 0) return;

    this.isSubmitting = true;

    // Simular delay para feedback visual
    setTimeout(() => {
      this.dialogRef.close({
        submitted: true,
        rating: this.selectedRating,
        comment: this.comment.trim() || undefined
      } as SurveyDialogResult);
    }, 300);
  }

  skip(): void {
    this.dialogRef.close({
      submitted: false
    } as SurveyDialogResult);
  }
}
