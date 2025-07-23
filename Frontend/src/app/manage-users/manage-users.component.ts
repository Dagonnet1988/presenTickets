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

import { ChangeDetectionStrategy, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../shared/services/user.service';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatDialogModule,
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterModule
  ],
  templateUrl: './manage-users.component.html',
  styleUrls: ['./manage-users.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageUsersComponent implements OnInit {
  @ViewChild('confirmDialog') confirmDialog!: TemplateRef<any>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  dialogRef!: MatDialogRef<any>;

  users$!: Observable<any[]>;
  allUsers: any[] = []; // Almacenar todos los usuarios para filtros
  displayedColumns: string[] = ['username', 'name', 'lastname', 'role', 'actions'];
  searchQuery: string = '';
  selectedRole: string = 'all';
  showSuspended: boolean = false;
  sortBy: string = 'username';
  dataSource = new MatTableDataSource<any>();

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.userService.loadUsers(); // Cargar usuarios desde el servicio
    this.users$ = this.userService.users$;

    this.users$.subscribe(users => {
      // Solo procesar si efectivamente hay usuarios cargados
      if (users && users.length > 0) {
        // Guardar todos los usuarios para filtros posteriores
        this.allUsers = users.filter(user => user.role !== 'admin'); // Excluir administradores
        this.applyFilters(); // Aplicar filtros iniciales
        this.dataSource.paginator = this.paginator; // Conectar el paginador
      }
      // Remover el console.warn para evitar mensajes innecesarios
      // El estado inicial puede ser vacío mientras se cargan los datos
    });
  }

  applyFilters(): void {
    if (!this.allUsers) return; // No hacer nada si no hay usuarios cargados

    const filteredUsers = this.allUsers.filter(user => {
      // Asegurarse de que los campos no sean null
      const username = user.username ? user.username.toLowerCase() : '';
      const firstname = user.firstname ? user.firstname.toLowerCase() : '';
      const lastname = user.lastname ? user.lastname.toLowerCase() : '';

      const searchMatches =
        username.includes(this.searchQuery.toLowerCase()) ||
        firstname.includes(this.searchQuery.toLowerCase()) ||
        lastname.includes(this.searchQuery.toLowerCase());

      const roleMatches =
        this.selectedRole === 'all' || user.role === this.selectedRole;

      const statusMatches =
        this.showSuspended ? user.status === false : user.status !== false;

      return searchMatches && roleMatches && statusMatches;
    });

    const sortedUsers = filteredUsers.sort((a, b) => {
      if (this.sortBy === 'username') {
        return a.username.localeCompare(b.username);
      } else if (this.sortBy === 'firstname') {
        return a.firstname.localeCompare(b.firstname);
      } else if (this.sortBy === 'role') {
        return a.role.localeCompare(b.role);
      }
      return 0;
    });

    this.dataSource.data = sortedUsers;
  }

  onSearchQueryChange(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    this.applyFilters();
  }

  onRoleChange(role: string): void {
    this.selectedRole = role;
    this.applyFilters();
  }

  toggleSuspendedView(): void {
    this.showSuspended = !this.showSuspended;
    this.applyFilters();
  }

  resetPassword(user: any): void {
    this.dialogRef = this.dialog.open(this.confirmDialog, {
      width: '400px',
      data: { message: `¿Estás seguro de que deseas restablecer la contraseña de ${user.firstname}?` },
    });

    this.dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.userService.resetPassword(user.id, user.username).subscribe(
          () => {
            this.snackBar.open(`Contraseña de ${user.firstname} restablecida correctamente`, 'Cerrar', {
              duration: 3000,
            });
          },
          error => {
            console.error('Error al restablecer la contraseña:', error);
            this.snackBar.open('Error al restablecer la contraseña', 'Cerrar', { duration: 3000 });
          }
        );
      }
    });
  }

  editUser(user: any): void {
    this.router.navigate(['/edit-user', user.id]);
  }

  deleteUser(user: any): void {
    this.userService.deleteUser(user.id).subscribe(
      () => {
        this.snackBar.open('Usuario suspendido correctamente', 'Cerrar', { duration: 3000 });
        this.userService.loadUsers();
      },
      error => {
        console.error('Error al suspender el usuario:', error);
        this.snackBar.open('Error al suspender el usuario', 'Cerrar', { duration: 3000 });
      }
    );
  }

  reactiveUser(user: any): void {
    this.userService.reactiveUser(user.id).subscribe(
      () => {
        this.snackBar.open('Usuario reactivado correctamente', 'Cerrar', { duration: 3000 });
        this.userService.loadUsers();
      },
      error => {
        console.error('Error al reactivar el usuario:', error);
        this.snackBar.open('Error al reactivar el usuario', 'Cerrar', { duration: 3000 });
      }
    );
  }

  getRoleDisplay(role: string): string {
    return role === 'user' ? 'Usuario' : role === 'tech' ? 'Técnico' : role;
  }

  closeDialog(result: boolean): void {
    if (this.dialogRef) {
      this.dialogRef.close(result);
    }
  }
}
