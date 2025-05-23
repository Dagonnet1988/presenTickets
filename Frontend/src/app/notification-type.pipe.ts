import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'notificationType', standalone: true })
export class NotificationTypePipe implements PipeTransform {
  transform(type: string): string {
    switch (type) {
      case 'nuevo_ticket': return 'Nuevo Ticket';
      case 'comentario_user': return 'Nuevo Comentario';
      case 'comentario_tech': return 'Nuevo Comentario';
      case 'admin_comentario': return 'Nuevo Comentario';
      case 'admin_estado_ticket': return 'Nuevo estado de Ticket';
      case 'ticket_cerrado': return 'Ticket Cerrado';
      case 'ticket_resuelto': return 'Ticket Resuelto';
      case 'estado_escalado': return 'Ticket Escalado';
      case 'asignado_tecnico': return 'Ticket tomado por un técnico';
      case 'cerrado_por_usuario': return 'Ticket cerrado';
      case 'reabierto_por_usuario': return 'Ticket re-abierto';
      default: return type;
    }
  }
}
