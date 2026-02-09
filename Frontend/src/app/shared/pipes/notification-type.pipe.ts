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

import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'notificationType', standalone: true })
export class NotificationTypePipe implements PipeTransform {  transform(type: string): string {
    switch (type) {
      case 'nuevo_ticket': return 'Nuevo Ticket';
      case 'comentario_user': return 'Nuevo Comentario';
      case 'comentario_tech': return 'Nuevo Comentario';
      case 'comentario_admin': return 'Nuevo Comentario';
      case 'nuevo_comentario': return 'Nuevo Comentario';
      case 'admin_comentario': return 'Nuevo Comentario';
      case 'admin_estado_ticket': return 'Nuevo estado de Ticket';
      case 'ticket_cerrado': return 'Ticket Cerrado';
      case 'ticket_resuelto': return 'Ticket Resuelto';
      case 'estado_escalado': return 'Ticket Escalado';
      case 'ticket_asignado': return 'Ticket Asignado';
      case 'asignado_tecnico': return 'Ticket tomado por un técnico';
      case 'cerrado_por_usuario': return 'Ticket cerrado';
      case 'reabierto_por_usuario': return 'Ticket re-abierto';
      case 'ticket_reabierto': return 'Ticket Re-abierto';
      case 'cambio_estado': return 'Cambio de Estado';
      case 'external_email': return 'Correo Externo';
      default: return type;
    }
  }
}
