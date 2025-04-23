import { ChangeDetectionStrategy, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { UserService } from '../user.service';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatDialogModule,
    CommonModule,
    FormsModule
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
      if (users && users.length > 0) {
        this.dataSource.data = users.filter(user => user.role !== 'admin'); // Excluir administradores
        this.dataSource.paginator = this.paginator; // Conectar el paginador
        this.applyFilters(); // Aplicar filtros iniciales
      } else {
        console.warn('No se encontraron usuarios.');
      }
    });
  }

  applyFilters(): void {
    this.users$.subscribe(users => {
      const filteredUsers = users.filter(user => {
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
    });
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
