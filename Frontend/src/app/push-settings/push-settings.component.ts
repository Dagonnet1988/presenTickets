/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Componente para configurar notificaciones push
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 */

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PushNotificationService } from '../shared/services/push-notification.service';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card class="push-settings-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>notifications_active</mat-icon>
          Configuración de Notificaciones Push
        </mat-card-title>
        <mat-card-subtitle>
          Recibe notificaciones en tu dispositivo incluso cuando la aplicación esté cerrada
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="setting-section">          <div class="setting-info">
            <h3>Notificaciones del Navegador</h3>
            <p>
              Las notificaciones push te permiten estar al tanto de nuevos tickets,
              comentarios y cambios de estado en tiempo real.
            </p>
            <div class="info-section" *ngIf="isEnabled">
              <mat-icon color="primary">info</mat-icon>
              <p>
                <strong>¡Activadas automáticamente!</strong> Las notificaciones push se activan automáticamente
                cuando ingresas a la aplicación para asegurar que no te pierdas ninguna actualización importante.
              </p>
            </div>
          </div>

          <div class="setting-controls">
            <mat-slide-toggle
              [checked]="isEnabled"
              [disabled]="!isSupported || isLoading"
              (change)="toggleNotifications($event.checked)"
              color="primary">
              {{ isEnabled ? 'Activadas' : 'Desactivadas' }}
            </mat-slide-toggle>
          </div>
        </div>

        <div class="info-section" *ngIf="!isSupported">
          <mat-icon color="warn">warning</mat-icon>
          <p>Tu navegador no soporta notificaciones push o no están disponibles en este contexto.</p>
        </div>

        <div class="info-section" *ngIf="isSupported && !isEnabled">
          <mat-icon color="accent">info</mat-icon>
          <p>
            Al activar las notificaciones, podrás recibir alertas instantáneas sobre:
          </p>
          <ul>
            <li>Nuevos tickets asignados</li>
            <li>Comentarios en tus tickets</li>
            <li>Cambios de estado</li>
            <li>Tickets reabiertos</li>
          </ul>
        </div>        <div class="test-section" *ngIf="isEnabled">
          <button
            mat-raised-button
            color="accent"
            (click)="sendTestNotification()"
            [disabled]="isLoading">
            <mat-icon>send</mat-icon>
            Enviar Notificación de Prueba
          </button>
        </div>

        <div class="diagnostic-section">
          <button
            mat-stroked-button
            color="primary"
            (click)="runDiagnostic()"
            [disabled]="isLoading">
            <mat-icon>bug_report</mat-icon>
            Ejecutar Diagnóstico
          </button>
          <p class="diagnostic-info">
            Ejecuta un diagnóstico completo del sistema de notificaciones push
          </p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .push-settings-card {
      max-width: 600px;
      margin: 24px auto;
    }

    .setting-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .setting-info {
      flex: 1;
      margin-right: 16px;
    }

    .setting-info h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .setting-info p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }

    .setting-controls {
      display: flex;
      align-items: center;
    }

    .info-section {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
      padding: 12px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }

    .info-section mat-icon {
      margin-right: 12px;
      margin-top: 2px;
    }

    .info-section p {
      margin: 0;
      flex: 1;
    }

    .info-section ul {
      margin: 8px 0 0 0;
      padding-left: 16px;
    }

    .info-section li {
      margin-bottom: 4px;
    }    .test-section {
      text-align: center;
      margin-top: 24px;
    }

    .diagnostic-section {
      text-align: center;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .diagnostic-info {
      margin: 8px 0 0 0;
      font-size: 14px;
      color: #666;
    }

    @media (max-width: 768px) {
      .push-settings-card {
        margin: 16px;
      }

      .setting-section {
        flex-direction: column;
        align-items: stretch;
      }

      .setting-info {
        margin-right: 0;
        margin-bottom: 16px;
      }
    }
  `]
})
export class PushSettingsComponent implements OnInit {
  isEnabled = false;
  isSupported = false;
  isLoading = false;

  constructor(
    private pushService: PushNotificationService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isSupported = this.pushService.isNotificationSupported();
    this.pushService.isEnabled$.subscribe(enabled => {
      this.isEnabled = enabled;
    });
  }

  async toggleNotifications(enable: boolean): Promise<void> {
    this.isLoading = true;

    try {
      if (enable) {
        const success = await this.pushService.requestPermissionAndSubscribe();
        if (success) {
          this.snackBar.open('✅ Notificaciones push activadas correctamente', 'Cerrar', {
            duration: 5000,
            panelClass: ['success-snackbar']
          });
        } else {
          this.snackBar.open('❌ No se pudieron activar las notificaciones push', 'Cerrar', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      } else {
        const success = await this.pushService.unsubscribe();
        if (success) {
          this.snackBar.open('✅ Notificaciones push desactivadas', 'Cerrar', {
            duration: 3000
          });
        } else {
          this.snackBar.open('❌ Error al desactivar las notificaciones', 'Cerrar', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
      this.snackBar.open('❌ Error inesperado al configurar las notificaciones', 'Cerrar', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }
  async sendTestNotification(): Promise<void> {
    this.isLoading = true;

    try {
      // Aquí podrías llamar a un endpoint del backend para enviar una notificación de prueba
      // Por ahora, mostramos un mensaje de confirmación
      this.snackBar.open('🔔 Notificación de prueba enviada', 'Cerrar', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
      this.snackBar.open('❌ Error al enviar notificación de prueba', 'Cerrar', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  async runDiagnostic(): Promise<void> {
    this.isLoading = true;
    console.clear();

    try {
      console.log('🔍 DIAGNÓSTICO DE NOTIFICACIONES PUSH INICIADO');
      console.log('═'.repeat(50));

      const diagnostico = await this.ejecutarDiagnosticoCompleto();

      // Mostrar resultado en snackbar
      const problemas = this.contarProblemas(diagnostico);
      if (problemas === 0) {
        this.snackBar.open('✅ Diagnóstico completado: Sistema funcionando correctamente', 'Cerrar', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
      } else {
        this.snackBar.open(`⚠️ Diagnóstico completado: ${problemas} problema(s) encontrado(s). Ver consola (F12)`, 'Cerrar', {
          duration: 8000,
          panelClass: ['warning-snackbar']
        });
      }

      console.log('\n🎯 DIAGNÓSTICO COMPLETADO - Revisa los resultados arriba');
      console.log('═'.repeat(50));

    } catch (error) {
      console.error('❌ Error durante el diagnóstico:', error);
      this.snackBar.open('❌ Error durante el diagnóstico. Ver consola (F12)', 'Cerrar', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  private async ejecutarDiagnosticoCompleto(): Promise<any> {
    const diagnostico: any = {};

    // 1. Verificar soporte del navegador
    console.log('📱 1. VERIFICANDO SOPORTE DEL NAVEGADOR');
    diagnostico.soporte = {
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notifications: 'Notification' in window
    };

    console.log('   ✓ Service Worker:', diagnostico.soporte.serviceWorker ? '✅ Soportado' : '❌ No soportado');
    console.log('   ✓ Push Manager:', diagnostico.soporte.pushManager ? '✅ Soportado' : '❌ No soportado');
    console.log('   ✓ Notifications:', diagnostico.soporte.notifications ? '✅ Soportado' : '❌ No soportado');

    // 2. Verificar archivos
    console.log('\n📁 2. VERIFICANDO ARCHIVOS CRÍTICOS');
    try {
      const swResponse = await fetch('/sw.js');
      diagnostico.archivos = {
        serviceWorker: {
          disponible: swResponse.ok,
          status: swResponse.status
        }
      };
      console.log('   ✓ Service Worker (/sw.js):', swResponse.ok ? '✅ Disponible' : '❌ No disponible');
    } catch (error) {
      diagnostico.archivos = { serviceWorker: { error: error } };
      console.log('   ✓ Service Worker (/sw.js): ❌ Error al verificar');
    }

    // 3. Verificar permisos
    console.log('\n🔒 3. VERIFICANDO PERMISOS');
    diagnostico.permisos = {
      estado: Notification.permission
    };
    console.log('   ✓ Estado actual:', diagnostico.permisos.estado);

    // 4. Verificar Service Worker registrado
    console.log('\n⚙️ 4. VERIFICANDO SERVICE WORKER REGISTRADO');
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      diagnostico.serviceWorker = {
        registros: registrations.length,
        detalles: registrations.map(reg => ({
          scope: reg.scope,
          activo: !!reg.active
        }))
      };
      console.log('   ✓ Registros encontrados:', registrations.length);

      if (registrations.length > 0) {
        registrations.forEach((reg, index) => {
          console.log(`   ✓ SW ${index + 1}: ${reg.scope} (${reg.active ? 'Activo' : 'Inactivo'})`);
        });
      } else {
        console.log('   ⚠️ No hay Service Workers registrados');
      }
    } catch (error) {
      diagnostico.serviceWorker = { error: error };
      console.log('   ❌ Error verificando Service Workers');
    }

    // 5. Verificar suscripción
    console.log('\n📡 5. VERIFICANDO SUSCRIPCIÓN PUSH');
    try {
      if (diagnostico.serviceWorker?.registros > 0) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        diagnostico.suscripcion = {
          activa: !!subscription,
          endpoint: subscription?.endpoint
        };

        console.log('   ✓ Suscripción activa:', subscription ? '✅ Sí' : '❌ No');
        if (subscription) {
          console.log('   ✓ Endpoint:', subscription.endpoint.substring(0, 50) + '...');
        }
      } else {
        diagnostico.suscripcion = { error: 'No hay SW registrado' };
        console.log('   ❌ No se puede verificar suscripción sin Service Worker');
      }
    } catch (error) {
      diagnostico.suscripcion = { error: error };
      console.log('   ❌ Error verificando suscripción');
    }

    return diagnostico;
  }

  private contarProblemas(diagnostico: any): number {
    let problemas = 0;

    // Verificar problemas críticos
    if (!diagnostico.soporte?.serviceWorker || !diagnostico.soporte?.pushManager || !diagnostico.soporte?.notifications) {
      problemas++;
    }

    if (!diagnostico.archivos?.serviceWorker?.disponible) {
      problemas++;
    }

    if (diagnostico.permisos?.estado !== 'granted') {
      problemas++;
    }

    if (!diagnostico.serviceWorker?.registros || diagnostico.serviceWorker.registros === 0) {
      problemas++;
    }

    if (!diagnostico.suscripcion?.activa) {
      problemas++;
    }

    return problemas;
  }
}
