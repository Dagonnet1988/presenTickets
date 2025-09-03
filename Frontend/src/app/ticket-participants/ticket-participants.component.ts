/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Componente de Gestión de Participantes de Tickets
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 */

import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  TicketParticipantsService,
  TicketParticipant,
  AvailableUser
} from '../shared/services/ticket-participants.service';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-ticket-participants',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  template: `
    <div class="participants-compact">
      <!-- Header compacto -->
      <div class="participants-header">
        <mat-icon>group</mat-icon>
        <span class="header-title">Participantes ({{ participants.length }})</span>
        <button
          mat-icon-button
          *ngIf="canManageParticipants()"
          (click)="showAddForm = !showAddForm"
          matTooltip="Agregar participante"
          class="add-toggle-btn">
          <mat-icon>{{ showAddForm ? 'close' : 'person_add' }}</mat-icon>
        </button>
      </div>

      <!-- Lista compacta de participantes -->
      <div class="participants-chips" *ngIf="participants.length > 0">
        <mat-chip-listbox class="participants-chip-list">
          <mat-chip-option
            *ngFor="let participant of participants"
            class="participant-chip"
            [style.backgroundColor]="getRoleColor(participant.role)"
            [matTooltip]="getTooltipText(participant)">

            <mat-icon matChipAvatar>person</mat-icon>

            {{ participant.full_name }}

            <mat-icon
              matChipRemove
              *ngIf="canManageParticipants()"
              (click)="removeParticipant(participant)">
              close
            </mat-icon>
          </mat-chip-option>
        </mat-chip-listbox>
      </div>

      <!-- Mensaje cuando no hay participantes -->
      <div class="no-participants-msg" *ngIf="participants.length === 0">
        <small>No hay participantes adicionales</small>
      </div>

      <!-- Formulario compacto para agregar -->
      <div class="add-form-compact" *ngIf="showAddForm && canManageParticipants()">
        <!-- Campo de búsqueda -->
        <div class="search-row">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Buscar usuario</mat-label>
            <input matInput
                   [(ngModel)]="searchText"
                   (ngModelChange)="onSearchChange()"
                   placeholder="Nombre, apellido o email...">
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        <div class="form-row-compact">
          <mat-form-field appearance="outline" class="user-field">
            <mat-label>Usuario ({{ availableUsers.length }} disponibles)</mat-label>
            <mat-select [(value)]="selectedUserId">
              <mat-option *ngFor="let user of availableUsers" [value]="user.id">
                {{ user.full_name }} - {{ user.role }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <button
            mat-mini-fab
            color="primary"
            (click)="addParticipant()"
            [disabled]="!selectedUserId || isLoading"
            matTooltip="Agregar participante">
            <mat-icon>add</mat-icon>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .participants-compact {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      margin: 8px 0;
      border-left: 4px solid #2196F3;
    }

    .participants-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .header-title {
      font-weight: 500;
      font-size: 14px;
      flex: 1;
    }

    .add-toggle-btn {
      width: 32px;
      height: 32px;
    }

    .participants-chips {
      margin-bottom: 8px;
    }

    .participants-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .participant-chip {
      color: white !important;
      font-size: 12px;
      font-weight: 500;
      border: none;
    }

    .participant-chip mat-icon {
      color: white !important;
    }

    .no-participants-msg {
      color: rgba(0,0,0,0.6);
      font-style: italic;
      text-align: center;
      padding: 8px;
    }

    .add-form-compact {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(0,0,0,0.12);
    }

    .search-row {
      margin-bottom: 12px;
    }

    .search-field {
      width: 100%;
    }

    .form-row-compact {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .user-field {
      flex: 1;
    }

    .user-field mat-form-field {
      font-size: 14px;
    }

    ::ng-deep .participants-compact .mat-mdc-form-field {
      margin-bottom: 0;
    }

    ::ng-deep .participants-compact .mat-mdc-form-field .mat-mdc-floating-label {
      font-size: 12px;
    }

    @media (max-width: 768px) {
      .form-row-compact {
        flex-direction: column;
        gap: 8px;
      }

      .user-field {
        flex: 1;
        width: 100%;
      }
    }
  `]
})
export class TicketParticipantsComponent implements OnInit, OnDestroy {
  @Input() ticketId!: number;

  participants: TicketParticipant[] = [];
  availableUsers: AvailableUser[] = [];
  selectedUserId: number | null = null;
  searchText: string = '';
  private searchTimeout: any;
  isLoading = false;
  showAddForm = false;
  private isLoadingParticipants = false;

  constructor(
    private participantsService: TicketParticipantsService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadParticipants();
    if (this.canManageParticipants()) {
      this.loadAvailableUsers();
    }
  }

  ngOnDestroy() {
    // Limpiar timeout para evitar memory leaks
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  /**
   * Cargar participantes del ticket
   */
  loadParticipants() {
    if (this.isLoadingParticipants) {
      return;
    }

    this.isLoadingParticipants = true;
    this.participantsService.getParticipants(this.ticketId).subscribe({
      next: (participants) => {
        this.participants = participants;
        this.isLoadingParticipants = false;
      },
      error: (error) => {
        console.error('Error cargando participantes:', error);
        this.snackBar.open('Error al cargar participantes', 'Cerrar', {
          duration: 3000
        });
        this.isLoadingParticipants = false;
      }
    });
  }

  /**
   * Cargar usuarios disponibles para agregar
   */
  loadAvailableUsers(search?: string) {
    this.participantsService.getAvailableUsers(this.ticketId, search).subscribe({
      next: (users) => {
        this.availableUsers = users;
      },
      error: (error) => {
        console.error('Error cargando usuarios disponibles:', error);
      }
    });
  }

  /**
   * Manejar cambios en el campo de búsqueda con debounce
   */
  onSearchChange() {
    // Limpiar el timeout anterior
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Crear nuevo timeout para evitar demasiadas consultas
    this.searchTimeout = setTimeout(() => {
      this.loadAvailableUsers(this.searchText);
      // Resetear la selección si hay búsqueda activa
      if (this.searchText && this.selectedUserId) {
        this.selectedUserId = null;
      }
    }, 300); // 300ms de delay
  }

  /**
   * Agregar participante
   */
  addParticipant() {
    if (!this.selectedUserId || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.participantsService.addParticipant(
      this.ticketId,
      this.selectedUserId
    ).subscribe({
      next: (response) => {
        this.snackBar.open('Participante agregado correctamente', 'Cerrar', {
          duration: 3000
        });

        // Agregar el participante a la lista local para evitar recarga completa
        if (response.participant) {
          this.participants.push({
            user_id: response.participant.user_id,
            username: response.participant.username,
            full_name: response.participant.full_name,
            role: 'user', // Valor por defecto, se actualizará en la próxima carga
            email: ''
          });
        }

        // Solo recargar usuarios disponibles manteniendo la búsqueda
        this.loadAvailableUsers(this.searchText);
        this.selectedUserId = null;
        this.showAddForm = false;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error agregando participante:', error);
        this.snackBar.open('Error al agregar participante', 'Cerrar', {
          duration: 3000
        });
        this.isLoading = false;
      }
    });
  }

  /**
   * Remover participante
   */
  removeParticipant(participant: TicketParticipant) {
    if (confirm(`¿Estás seguro de remover a ${participant.full_name} como participante?`)) {
      this.participantsService.removeParticipant(this.ticketId, participant.user_id).subscribe({
        next: () => {
          this.snackBar.open('Participante removido correctamente', 'Cerrar', {
            duration: 3000
          });

          // Remover del array local para evitar recarga completa
          this.participants = this.participants.filter(p => p.user_id !== participant.user_id);

          // Solo recargar usuarios disponibles manteniendo la búsqueda
          this.loadAvailableUsers(this.searchText);
        },
        error: (error) => {
          console.error('Error removiendo participante:', error);
          this.snackBar.open('Error al remover participante', 'Cerrar', {
            duration: 3000
          });
        }
      });
    }
  }

  /**
   * Verificar si el usuario puede gestionar participantes
   */
  canManageParticipants(): boolean {
    const userRole = this.authService.getUserRole();
    return userRole ? this.participantsService.canManageParticipants(userRole) : false;
  }

  /**
   * Obtener color para el rol del usuario (basado en el rol real del usuario)
   */
  getRoleColor(userRole: string): string {
    const colors: { [key: string]: string } = {
      'admin': '#e91e63',
      'tech': '#4CAF50',
      'user': '#2196F3'
    };
    return colors[userRole] || '#757575';
  }

  /**
   * Obtener texto del tooltip para participante
   */
  getTooltipText(participant: TicketParticipant): string {
    return `${participant.full_name} (${participant.role})`;
  }
}
