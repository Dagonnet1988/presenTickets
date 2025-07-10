/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * API para notificaciones push
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import express from 'express';
import webpush from 'web-push';
import { pool } from '../server.js';
import { authMiddleware } from './auth.js';

const router = express.Router();

// Configurar VAPID keys para web-push
const vapidKeys = {
  publicKey: 'BE5ELcyVhk37zJr2O4nfNkHn8jBYLBdciU1dkSOgC8ovj1_S-TkkhXGgrZifgVchjeQG2xDMUhCgznoXaY-H8C0',
  privateKey: 'VlxyucHp8YPi7aVR3M4Mc_P1a4P1grQSFEM_BYJtOm4'
};

webpush.setVapidDetails(
  'mailto:admin@presentickets.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Suscribirse a notificaciones push
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Datos de suscripción incompletos' });
    }

    const client = await pool.connect();
    try {
      // Verificar si ya existe una suscripción para este usuario
      const existingSubscription = await client.query(
        'SELECT id FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      if (existingSubscription.rows.length > 0) {
        // Actualizar suscripción existente
        await client.query(
          'UPDATE push_subscriptions SET endpoint = $1, p256dh_key = $2, auth_key = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4',
          [endpoint, keys.p256dh, keys.auth, userId]
        );
      } else {
        // Crear nueva suscripción
        await client.query(
          'INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key) VALUES ($1, $2, $3, $4)',
          [userId, endpoint, keys.p256dh, keys.auth]
        );
      }

      res.json({ success: true, message: 'Suscripción guardada correctamente' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al guardar suscripción push:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Desuscribirse de notificaciones push
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body;

    const client = await pool.connect();
    try {
      await client.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, endpoint]
      );

      res.json({ success: true, message: 'Suscripción eliminada correctamente' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al eliminar suscripción push:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Función para enviar notificación push a un usuario específico
export async function sendPushNotification(userId, notification) {
  try {
    const client = await pool.connect();
    try {
      // Obtener suscripciones del usuario
      const subscriptions = await client.query(
        'SELECT endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      if (subscriptions.rows.length === 0) {
        console.log(`Usuario ${userId} no tiene suscripciones push activas`);
        return;
      }

      // Enviar notificación a cada suscripción
      const pushPromises = subscriptions.rows.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, JSON.stringify(notification));
        } catch (error) {
          console.error(`❌ Error sending push notification to user ${userId}:`, error);
          
          // Si la suscripción es inválida, eliminarla
          if (error.statusCode === 410 || error.statusCode === 404) {
            await client.query(
              'DELETE FROM push_subscriptions WHERE endpoint = $1',
              [sub.endpoint]
            );
            console.log(`🗑️ Removed invalid subscription: ${sub.endpoint}`);
          }
        }
      });

      await Promise.all(pushPromises);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error enviando notificación push:', error);
  }
}

// Función para enviar notificaciones push masivas
export async function sendPushNotificationToUsers(userIds, notification) {
  const promises = userIds.map(userId => sendPushNotification(userId, notification));
  await Promise.allSettled(promises);
}

// Endpoint de prueba para enviar notificación 
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const testNotification = {
      title: 'Notificación de Prueba',
      body: 'Esta es una notificación push de prueba desde PresenTickets',
      tag: 'test-notification',
      url: '/',
      ticketId: null
    };

    await sendPushNotification(userId, testNotification);
    res.json({ success: true, message: 'Notificación de prueba enviada' });
  } catch (error) {
    console.error('Error enviando notificación de prueba:', error);
    res.status(500).json({ error: 'Error al enviar notificación de prueba' });
  }
});

export default router;
