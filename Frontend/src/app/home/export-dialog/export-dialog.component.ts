/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 */

import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

export interface ExportColumn {
  key: string;
  label: string;
  selected: boolean;
  width?: number;
}

export interface ExportDialogData {
  tickets: any[]; // Todos los tickets (sin filtrar)
  userRole: string;
  userNames: { [key: string]: string };
}

export interface ExportDialogResult {
  columns: ExportColumn[];
  tickets: any[];
}

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>file_download</mat-icon>
      Exportar a Excel
    </h2>

    <mat-dialog-content>
      <!-- Filtro de estado -->
      <div class="filter-section">
        <mat-form-field appearance="outline" class="status-filter">
          <mat-label>Estado de tickets</mat-label>
          <mat-select [(ngModel)]="statusFilter" (selectionChange)="onStatusChange()">
            <mat-option value="abiertos">Abiertos</mat-option>
            <mat-option value="cerrados">Cerrados</mat-option>
            <mat-option value="todos">Todos</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <p class="export-info">
        <mat-icon>info</mat-icon>
        Se exportarán <strong>{{ getFilteredTicketsCount() }}</strong> tickets.
      </p>

      <div class="columns-section">
        <div class="columns-header">
          <span>Selecciona las columnas a exportar:</span>
          <div class="select-actions">
            <button mat-button (click)="selectAll()" class="select-btn">
              <mat-icon>check_box</mat-icon>
              Todas
            </button>
            <button mat-button (click)="selectNone()" class="select-btn">
              <mat-icon>check_box_outline_blank</mat-icon>
              Ninguna
            </button>
          </div>
        </div>

        <div class="columns-grid">
          <mat-checkbox
            *ngFor="let col of columns"
            [(ngModel)]="col.selected"
            class="column-checkbox">
            {{ col.label }}
          </mat-checkbox>
        </div>
      </div>

      <p class="selected-count">
        {{ getSelectedCount() }} columnas seleccionadas
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close class="cancel-btn">
        Cancelar
      </button>
      <button mat-raised-button
              color="primary"
              [disabled]="getSelectedCount() === 0 || getFilteredTicketsCount() === 0"
              (click)="export()"
              class="export-btn">
        <mat-icon>download</mat-icon>
        Exportar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #1976d2;
      margin: 0;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    h2[mat-dialog-title] mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    mat-dialog-content {
      padding: 20px 24px !important;
      min-width: 400px;
      max-height: 450px;
    }

    .filter-section {
      margin-bottom: 16px;
    }

    .status-filter {
      width: 100%;
    }

    .export-info {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #e3f2fd;
      padding: 12px 16px;
      border-radius: 8px;
      margin: 0 0 20px 0;
      color: #1565c0;
    }

    .export-info mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .columns-section {
      background: #fafafa;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid #e0e0e0;
    }

    .columns-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .columns-header span {
      font-weight: 500;
      color: #424242;
    }

    .select-actions {
      display: flex;
      gap: 4px;
    }

    .select-btn {
      font-size: 12px;
      min-width: auto;
      padding: 0 8px;
    }

    .select-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }

    .columns-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px 24px;
    }

    .column-checkbox {
      font-size: 14px;
    }

    .selected-count {
      text-align: right;
      color: #757575;
      font-size: 13px;
      margin: 12px 0 0 0;
    }

    mat-dialog-actions {
      padding: 12px 24px !important;
      border-top: 1px solid #e0e0e0;
      margin: 0 !important;
    }

    .cancel-btn {
      color: #757575;
    }

    .export-btn {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .export-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    @media (max-width: 500px) {
      mat-dialog-content {
        min-width: 280px;
      }

      .columns-grid {
        grid-template-columns: 1fr;
      }

      .columns-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `]
})
export class ExportDialogComponent {
  columns: ExportColumn[] = [];
  statusFilter: string = 'abiertos'; // Default: abiertos

  constructor(
    public dialogRef: MatDialogRef<ExportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ExportDialogData
  ) {
    this.initColumns();
  }

  private initColumns(): void {
    // Columnas base disponibles para todos los roles
    // Por defecto seleccionadas: # Ticket, Título, Estado, Fecha Creación
    const baseColumns: ExportColumn[] = [
      { key: 'id', label: '# Ticket', selected: true, width: 10 },
      { key: 'title', label: 'Título', selected: true, width: 40 },
      { key: 'description', label: 'Descripción', selected: false, width: 50 },
      { key: 'status', label: 'Estado', selected: true, width: 25 },
      { key: 'area', label: 'Área', selected: false, width: 20 },
      { key: 'created_at', label: 'Fecha Creación', selected: true, width: 20 },
      { key: 'external_ticket_id', label: 'ID Externo', selected: false, width: 18 },
    ];

    // Columnas adicionales para admin y tech
    const adminTechColumns: ExportColumn[] = [
      { key: 'priority', label: 'Prioridad', selected: false, width: 12 },
      { key: 'user_name', label: 'Creado por', selected: false, width: 20 },
      { key: 'assigned_to_name', label: 'Asignado a', selected: false, width: 20 },
      { key: 'closed_at', label: 'Fecha Cierre', selected: false, width: 20 },
      { key: 'resolution_time', label: 'Tiempo Resolución', selected: false, width: 18 },
    ];

    this.columns = [...baseColumns];

    if (this.data.userRole === 'admin' || this.data.userRole === 'tech') {
      this.columns.push(...adminTechColumns);
    }
  }

  onStatusChange(): void {
    // Solo para actualizar el contador
  }

  getFilteredTickets(): any[] {
    if (!this.data.tickets) return [];

    return this.data.tickets.filter(ticket => {
      switch (this.statusFilter) {
        case 'abiertos':
          return ticket.status !== 'Cerrado' && ticket.status !== 'Resuelto';
        case 'cerrados':
          return ticket.status === 'Cerrado' || ticket.status === 'Resuelto';
        case 'todos':
        default:
          return true;
      }
    });
  }

  getFilteredTicketsCount(): number {
    return this.getFilteredTickets().length;
  }

  selectAll(): void {
    this.columns.forEach(col => col.selected = true);
  }

  selectNone(): void {
    this.columns.forEach(col => col.selected = false);
  }

  getSelectedCount(): number {
    return this.columns.filter(col => col.selected).length;
  }

  getSelectedColumns(): ExportColumn[] {
    return this.columns.filter(col => col.selected);
  }

  export(): void {
    const result: ExportDialogResult = {
      columns: this.getSelectedColumns(),
      tickets: this.getFilteredTickets()
    };
    this.dialogRef.close(result);
  }
}
