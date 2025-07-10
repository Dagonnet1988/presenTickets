/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Servicio para manejar notificaciones push del navegador
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private isSupported = false;
  private isEnabledSubject = new BehaviorSubject<boolean>(false);
  public isEnabled$ = this.isEnabledSubject.asObservable();  // Clave pública VAPID - debe coincidir con la del backend
  private readonly vapidPublicKey = 'BE5ELcyVhk37zJr2O4nfNkHn8jBYLBdciU1dkSOgC8ovj1_S-TkkhXGgrZifgVchjeQG2xDMUhCgznoXaY-H8C0';

  constructor(private http: HttpClient) {
    this.checkSupport();
    this.checkCurrentStatus();
  }  /**
   * Verificar si el navegador soporta notificaciones push
   */
  private checkSupport(): void {
    // Verificar que estamos en el navegador (no en servidor SSR)
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.isSupported = false;
      return;
    }

    const serviceWorkerSupported = 'serviceWorker' in navigator;
    const pushManagerSupported = 'PushManager' in window;
    const notificationSupported = 'Notification' in window;
    const secureContext = window.isSecureContext;

    this.isSupported = serviceWorkerSupported &&
                       pushManagerSupported &&
                       notificationSupported &&
                       secureContext;

    // Si no está soportado, explicar por qué
    if (!this.isSupported) {
      if (!serviceWorkerSupported) {
        console.warn('❌ Service Worker not supported - Update your browser');
      }
      if (!pushManagerSupported) {
        console.warn('❌ Push Manager not supported - Check browser/context');
      }
      if (!notificationSupported) {
        console.warn('❌ Notification API not supported - Update your browser');
      }
      if (!secureContext) {
        console.warn('❌ Insecure context - Use HTTPS or localhost');
      }
    }
  }  /**
   * Verificar el estado actual de las notificaciones
   */
  private async checkCurrentStatus(): Promise<void> {
    // Verificar que estamos en el navegador
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    if (!this.isSupported) return;

    try {
      // Solo verificar el permiso actual, NO solicitarlo
      const permission = Notification.permission;

      // Solo verificar service worker si existe
      let subscription = null;
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          subscription = await registration.pushManager.getSubscription();
        } catch (swError: any) {
          // Service worker not ready yet
        }
      }

      const isEnabled = permission === 'granted' && subscription !== null;
      this.isEnabledSubject.next(isEnabled);
    } catch (error) {
      console.error('❌ Error checking push notification status:', error);
    }
  }

  /**
   * Solicitar permisos y suscribirse a notificaciones push
   */
  async requestPermissionAndSubscribe(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('⚠️ Push notifications not supported');
      return false;
    }

    try {
      // 1. Solicitar permiso
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        return false;
      }

      // 2. Registrar Service Worker
      const registration = await this.registerServiceWorker();
      if (!registration) {
        return false;
      }

      // 3. Crear suscripción push
      const subscription = await this.createPushSubscription(registration);
      if (!subscription) {
        return false;
      }

      // 4. Enviar suscripción al backend
      const success = await this.sendSubscriptionToServer(subscription);

      if (success) {
        this.isEnabledSubject.next(true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error enabling push notifications:', error);
      return false;
    }
  }

  /**
   * Desactivar notificaciones push
   */
  async unsubscribe(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Desuscribirse del navegador
        await subscription.unsubscribe();

        // Notificar al backend
        await this.removeSubscriptionFromServer(subscription);

        this.isEnabledSubject.next(false);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error disabling push notifications:', error);
      return false;
    }
  }
  /**
   * Registrar el Service Worker
   */
  private async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Worker not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);

      // Intentar registrar desde una ruta alternativa
      try {
        const altRegistration = await navigator.serviceWorker.register('./sw.js');
        await navigator.serviceWorker.ready;
        return altRegistration;
      } catch (altError) {
        console.error('❌ Alternative SW registration also failed:', altError);
        return null;
      }
    }
  }

  /**
   * Crear suscripción push
   */
  private async createPushSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });

      return subscription;
    } catch (error) {
      console.error('❌ Failed to create push subscription:', error);
      return null;
    }
  }

  /**
   * Enviar suscripción al servidor
   */
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
    try {
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: this.arrayBufferToBase64(subscription.getKey('auth')!)
        }
      };

      await this.http.post(`${environment.backendUrl}/api/push/subscribe`, subscriptionData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).toPromise();

      return true;
    } catch (error) {
      console.error('❌ Failed to send subscription to server:', error);
      return false;
    }
  }

  /**
   * Remover suscripción del servidor
   */
  private async removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
    try {
      await this.http.post(`${environment.backendUrl}/api/push/unsubscribe`, {
        endpoint: subscription.endpoint
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).toPromise();

      console.log('✅ Subscription removed from server');
    } catch (error) {
      console.error('❌ Failed to remove subscription from server:', error);
    }
  }

  /**
   * Verificar si las notificaciones push están soportadas
   */
  isNotificationSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Verificar si las notificaciones están habilitadas
   */
  isEnabled(): boolean {
    return this.isEnabledSubject.value;
  }

  /**
   * Convertir clave VAPID de base64 a Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Convertir ArrayBuffer a base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Solicitar permisos y suscribirse automáticamente (modo silencioso)
   * Esta función es menos intrusiva y más adecuada para activación automática
   */
  async requestPermissionAndSubscribeQuietly(): Promise<boolean> {
    if (!this.isSupported) {
      return false;
    }

    try {
      // Verificar permisos actuales primero
      const currentPermission = Notification.permission;

      // Si ya está denegado, no insistir
      if (currentPermission === 'denied') {
        console.log('ℹ️ Notificaciones push denegadas por el usuario');
        return false;
      }

      // Si ya está concedido, proceder
      if (currentPermission === 'granted') {
        return await this.subscribeWithExistingPermission();
      }

      // Si es 'default', solicitar permiso de forma silenciosa
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        return await this.subscribeWithExistingPermission();
      }

      return false;
    } catch (error) {
      // Fallar silenciosamente en modo automático
      console.log('ℹ️ No se pudieron activar las notificaciones push automáticamente');
      return false;
    }
  }

  /**
   * Suscribirse con permisos ya concedidos
   */
  private async subscribeWithExistingPermission(): Promise<boolean> {
    try {
      // Registrar Service Worker
      const registration = await this.registerServiceWorker();
      if (!registration) {
        return false;
      }

      // Crear suscripción push
      const subscription = await this.createPushSubscription(registration);
      if (!subscription) {
        return false;
      }

      // Enviar suscripción al backend
      const success = await this.sendSubscriptionToServer(subscription);

      if (success) {
        this.isEnabledSubject.next(true);
        console.log('✅ Notificaciones push activadas automáticamente');
        return true;
      }

      return false;
    } catch (error) {
      console.log('ℹ️ Error en suscripción automática:', error);
      return false;
    }
  }
}
