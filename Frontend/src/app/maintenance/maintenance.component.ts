/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Componente Principal de Mantenimiento
 * Dashboard para administradores para gestionar el sistema de mantenimiento
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MaintenanceService, MaintenanceStatus, MaintenanceSession } from '../shared/services/maintenance.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatDialogModule,
    MatChipsModule,
    MatBadgeModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  templateUrl: './maintenance.component.html',
  styleUrls: ['./maintenance.component.css']
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Estado del mantenimiento
  maintenanceStatus: MaintenanceStatus | null = null;
  scheduledMaintenances: MaintenanceSession[] = [];
  maintenanceHistory: MaintenanceSession[] = [];

  // Formularios
  scheduleForm!: FormGroup;
  immediateForm!: FormGroup;

  // UI State
  loading = false;
  selectedTabIndex = 0;

  // Columnas de las tablas
  scheduledColumns: string[] = ['title', 'scheduledStart', 'scheduledEnd', 'status', 'actions'];
  historyColumns: string[] = ['title', 'actualStart', 'actualEnd', 'duration', 'status'];

  // Opciones de roles
  availableRoles = [
    { value: 'admin', label: 'Administradores' },
    { value: 'technician', label: 'Técnicos' },
    { value: 'supervisor', label: 'Supervisores' }
  ];

  constructor(
    private maintenanceService: MaintenanceService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.initializeForms();
  }

  ngOnInit(): void {
    this.loadMaintenanceData();
    this.subscribeToMaintenanceStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForms(): void {
    // Formulario para programar mantenimiento
    this.scheduleForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', [Validators.required, Validators.maxLength(1000)]],
      scheduledStart: ['', Validators.required],
      scheduledEnd: ['', Validators.required],
      allowedRoles: [['admin']],
      maintenanceMessage: ['Sistema en mantenimiento programado. Disculpe las molestias.']
    });

    // Formulario para mantenimiento inmediato
    this.immediateForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', [Validators.required, Validators.maxLength(1000)]],
      allowedRoles: [['admin']],
      maintenanceMessage: ['Sistema en mantenimiento. Disculpe las molestias.'],
      estimatedDuration: [60, [Validators.min(1), Validators.max(1440)]] // 1 minuto a 24 horas
    });
  }

  private subscribeToMaintenanceStatus(): void {
    this.maintenanceService.maintenanceStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.maintenanceStatus = status;
      });
  }

  loadMaintenanceData(): void {
    this.loading = true;

    // Cargar mantenimientos programados
    this.maintenanceService.getScheduledMaintenances({
      status: 'scheduled',
      limit: 10
    }).subscribe({
      next: (data) => {
        this.scheduledMaintenances = data.sessions;
      },
      error: (error) => {
        console.error('Error cargando mantenimientos programados:', error);
        this.showSnackBar('Error cargando mantenimientos programados', 'error');
      }
    });

    // Cargar historial (cambiar 'completed' por 'inactive' que es el estado final)
    this.maintenanceService.getMaintenanceHistory({
      limit: 10,
      status: 'inactive'
    }).subscribe({
      next: (data) => {
        this.maintenanceHistory = data.sessions;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando historial:', error);
        this.showSnackBar('Error cargando historial de mantenimiento', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Programar un nuevo mantenimiento
   */
  onScheduleMaintenance(): void {
    if (this.scheduleForm.valid) {
      this.loading = true;
      const formData = this.scheduleForm.value;

      this.maintenanceService.scheduleMaintenance(formData).subscribe({
        next: (response) => {
          this.showSnackBar(response.message, 'success');
          this.scheduleForm.reset();
          this.initializeForms(); // Resetear valores por defecto
          this.loadMaintenanceData();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error programando mantenimiento:', error);
          this.showSnackBar(error.error?.message || 'Error programando mantenimiento', 'error');
          this.loading = false;
        }
      });
    }
  }

  /**
   * Iniciar mantenimiento inmediato
   */
  onStartImmediateMaintenance(): void {
    if (this.immediateForm.valid) {
      this.loading = true;
      const formData = this.immediateForm.value;

      this.maintenanceService.startMaintenance(formData).subscribe({
        next: (response) => {
          this.showSnackBar(response.message, 'success');
          this.immediateForm.reset();
          this.initializeForms(); // Resetear valores por defecto
          this.loadMaintenanceData();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error iniciando mantenimiento:', error);
          this.showSnackBar(error.error?.message || 'Error iniciando mantenimiento', 'error');
          this.loading = false;
        }
      });
    }
  }

  /**
   * Activar un mantenimiento programado
   */
  onActivateMaintenance(session: MaintenanceSession): void {
    this.loading = true;

    this.maintenanceService.activateScheduledMaintenance(session.id).subscribe({
      next: (response) => {
        this.showSnackBar(response.message, 'success');
        this.loadMaintenanceData();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error activando mantenimiento:', error);
        this.showSnackBar(error.error?.message || 'Error activando mantenimiento', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Finalizar mantenimiento activo
   */
  onEndMaintenance(): void {
    if (this.maintenanceStatus?.session) {
      this.loading = true;

      this.maintenanceService.endMaintenance(this.maintenanceStatus.session.id).subscribe({
        next: (response) => {
          this.showSnackBar(response.message, 'success');
          this.loadMaintenanceData();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error finalizando mantenimiento:', error);
          this.showSnackBar(error.error?.message || 'Error finalizando mantenimiento', 'error');
          this.loading = false;
        }
      });
    }
  }

  /**
   * Cancelar un mantenimiento programado
   */
  onCancelMaintenance(session: MaintenanceSession): void {
    this.loading = true;

    this.maintenanceService.cancelScheduledMaintenance(session.id, 'Cancelado por administrador').subscribe({
      next: (response) => {
        this.showSnackBar(response.message, 'success');
        this.loadMaintenanceData();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cancelando mantenimiento:', error);
        this.showSnackBar(error.error?.message || 'Error cancelando mantenimiento', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Validar consistencia del sistema
   */
  onValidateConsistency(): void {
    this.loading = true;

    this.maintenanceService.validateConsistency().subscribe({
      next: (result) => {
        if (result.consistent) {
          this.showSnackBar('Sistema consistente - No se encontraron problemas', 'success');
        } else {
          this.showSnackBar(`Se encontraron ${result.issues.length} problemas de consistencia`, 'warning');
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error validando consistencia:', error);
        this.showSnackBar('Error validando consistencia del sistema', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Obtener el estado visual del mantenimiento
   */
  getMaintenanceStatusClass(): string {
    if (!this.maintenanceStatus) return 'inactive';

    switch (this.maintenanceStatus.status) {
      case 'active': return 'active';
      case 'scheduled': return 'scheduled';
      default: return 'inactive';
    }
  }

  /**
   * Obtener el tiempo restante para un mantenimiento programado
   */
  getTimeUntilMaintenance(scheduledStart: string | null | undefined): string {
    if (!scheduledStart) {
      return 'N/A';
    }

    try {
      const now = new Date();
      const start = new Date(scheduledStart);

      if (isNaN(start.getTime())) {
        return 'N/A';
      }

      const diff = start.getTime() - now.getTime();

      if (diff <= 0) return 'Vencido';

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
      }

      return `${hours}h ${minutes}m`;
    } catch (error) {
      return 'N/A';
    }
  }

  /**
   * Calcular duración de un mantenimiento
   */
  getMaintenanceDuration(start: string | null | undefined, end: string | null | undefined): string {
    if (!start || !end) {
      return 'N/A';
    }

    try {
      const startTime = new Date(start);
      const endTime = new Date(end);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return 'N/A';
      }

      const diff = endTime.getTime() - startTime.getTime();

      if (diff < 0) {
        return 'N/A';
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      return `${hours}h ${minutes}m`;
    } catch (error) {
      return 'N/A';
    }
  }

  /**
   * Mostrar mensaje en snackbar
   */
  private showSnackBar(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: [`snackbar-${type}`]
    });
  }
}
