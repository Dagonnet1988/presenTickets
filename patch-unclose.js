/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

// Patch for uncloseTicket method
const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'SISTEMAS3', 'Documents', 'Diego', 'Presentickets', 'Frontend', 'src', 'app', 'details-ticket', 'details-ticket.component.ts');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Find the uncloseTicket method
const unclosePattern = /uncloseTicket\(\): void \{[\s\S]*?\/\/ Usar rxjs[\s\S]*?import\('rxjs'\)[\s\S]*?\.then\(rxjs[\s\S]*?=>\s*\{[\s\S]*?\/\/ Primero cambiamos[\s\S]*?this\.ticketService\.updateTicketStatus[\s\S]*?\.pipe\([\s\S]*?rxjs\.switchMap[\s\S]*?rxjs\.of\(null\)[\s\S]*?\)[\s\S]*?subscribe[\s\S]*?\{[\s\S]*?next[\s\S]*?error[\s\S]*?\}[\s\S]*?\}\);/;

// Replacement text
const replacement = 
`uncloseTicket(): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (!ticketId) {
      console.error('No se pudo obtener el ID del ticket');
      return;
    }
    
    // Usar rxjs para manejar las operaciones secuencialmente
    import('rxjs').then(rxjs => {
      // Preparar el título con prefijo REABIERTO
      const originalTitle = this.ticket?.title || '';
      const newTitle = originalTitle.startsWith('REABIERTO') 
        ? originalTitle 
        : 'REABIERTO ' + originalTitle;
      
      // Primero actualizamos el título con prefijo REABIERTO
      this.ticketService.updateTicketName(ticketId, newTitle).subscribe({
        next: () => {
          // Luego cambiamos el estado
          this.ticketService.updateTicketStatus(ticketId, 'Esperando respuesta del usuario', this.userRole).subscribe({
            next: () => {
              // Actualizar la UI con los datos actualizados
              this.ticket.title = newTitle;
              this.ticket.status = 'Esperando respuesta del usuario';
              this.loadTicketDetails(ticketId);
            },
            error: (error) => {
              console.error('Error al cambiar el estado del ticket:', error.message);
              // Aún así intentamos recargar para mostrar datos consistentes
              this.loadTicketDetails(ticketId);
              this.cdr.markForCheck();
            }
          });
        },
        error: (error) => {
          console.error('Error al actualizar el título del ticket:', error.message);
          // Intentamos actualizar solo el estado si el título falló
          this.ticketService.updateTicketStatus(ticketId, 'Esperando respuesta del usuario', this.userRole).subscribe({
            next: () => {
              this.loadTicketDetails(ticketId);
              this.cdr.markForCheck();
            },
            error: () => {
              this.cdr.markForCheck();
            }
          });
        }
      });
    });`;

// Replace the method implementation
const modifiedContent = content.replace(unclosePattern, replacement);

// Write back to file
fs.writeFileSync(filePath, modifiedContent, 'utf8');

console.log('Successfully patched uncloseTicket method!');
