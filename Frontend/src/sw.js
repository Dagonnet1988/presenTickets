/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos lo// Activación del Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});echos reservados.
 *
 * Service Worker para notificaciones push
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 */

const CACHE_NAME = 'presentickets-v1';

// Escuchar eventos push
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'PresenTickets', body: event.data.text() };
    }
  }

  // Configuración de la notificación
  const options = {
    title: data.title || 'PresenTickets',
    body: data.body || 'Nueva notificación',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'presentickets-notification',
    data: {
      url: data.url || '/',
      ticketId: data.ticketId,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'Ver Ticket',
        icon: '/favicon.ico'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ],
    requireInteraction: true, // Mantener visible hasta que el usuario interactúe
    silent: false
  };

  // Mostrar la notificación
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Manejar clics en las notificaciones
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  if (action === 'close') {
    return;
  }

  // Determinar la URL a abrir
  let urlToOpen = '/';
  if (data.ticketId) {
    urlToOpen = `/ticket/${data.ticketId}`;
  } else if (data.url) {
    urlToOpen = data.url;
  }

  // Abrir o enfocar la ventana de la aplicación
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Buscar si ya hay una ventana abierta con la aplicación
        const existingClient = windowClients.find(client =>
          client.url.includes(self.location.origin)
        );

        if (existingClient) {
          // Si existe, enfocarla y navegar a la URL
          return existingClient.focus().then(client => {
            if (client.navigate) {
              return client.navigate(urlToOpen);
            }
            return client;
          });
        } else {
          // Si no existe, abrir nueva ventana
          return clients.openWindow(self.location.origin + urlToOpen);
        }
      })
  );
});

// Instalación del Service Worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('✅ Service Worker activado');
  event.waitUntil(clients.claim());
});
