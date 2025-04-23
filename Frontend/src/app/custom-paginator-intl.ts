import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

@Injectable() // Agregar el decorador @Injectable
export class CustomPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Usuarios por página:';
  override nextPageLabel = 'Siguiente página';
  override previousPageLabel = 'Página anterior';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 de ${length}`;
    }
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, length);
    return `${startIndex + 1} – ${endIndex} de ${length}`;
  };
}
