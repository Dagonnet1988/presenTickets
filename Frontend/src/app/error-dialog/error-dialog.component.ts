import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-error-dialog',
  templateUrl: './error-dialog.component.html', // Usar archivo HTML externo
  styleUrls: ['./error-dialog.component.css'] ,// Archivo CSS externo
  imports: [
    CommonModule,
    MatIcon
  ],
  standalone: true
})
export class ErrorDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { errors: string[] }
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
