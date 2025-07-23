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

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { isDevMode } from '@angular/core';

// Deshabilitar logs innecesarios en desarrollo
if (isDevMode()) {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0];
    // Filtrar warnings específicos que no son críticos
    if (typeof message === 'string') {
      if (message.includes('Angular is running in development mode') ||
          message.includes('NG0506') ||
          message.includes('ApplicationRef.isStable()')) {
        return;
      }
    }
    originalWarn.apply(console, args);
  };
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
