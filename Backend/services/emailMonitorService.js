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

import { ImapFlow } from 'imapflow';
import { pool } from '../db.js';
import { sendWhatsAppNotification } from '../routes/whatsapp.js';

class EmailMonitorService {
  constructor() {
    this.client = null;
    this.io = null;
    this.isRunning = false;
    this.isConnected = false;
    this.monitorInterval = null;
    this.lastCheckTime = null;
    this.errorCount = 0;
    this.maxErrors = 5; // Máximo de errores consecutivos antes de pausar

    // Configuración por defecto (se puede sobrescribir desde variables de entorno)
    this.config = {
      host: process.env.EMAIL_MONITOR_HOST || 'imap.gmail.com',
      port: parseInt(process.env.EMAIL_MONITOR_PORT) || 993,
      secure: true,
      auth: {
        user: process.env.EMAIL_MONITOR_USER || '',
        pass: process.env.EMAIL_MONITOR_PASSWORD || ''
      },
      // Remitente a filtrar
      filterSender: process.env.EMAIL_FILTER_SENDER || 'soporte@osigu.com',
      // Intervalo de revisión en ms (por defecto 2 minutos)
      checkInterval: parseInt(process.env.EMAIL_MONITOR_INTERVAL) || 120000
    };

    // Patrón para extraer número de ticket externo del asunto
    // Ejemplo: Re: [CHERMZ] [33405] Ticket re-abierto – [CHERMZ] [#28495] MIPRES...
    // Captura el primer número entre corchetes después de [CHERMZ]
    this.ticketPattern = /\[CHERMZ\]\s*\[#?(\d+)\]/i;
  }

  /**
   * Establecer referencia a Socket.IO para emitir eventos
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Verificar si la configuración es válida
   */
  isConfigured() {
    return this.config.auth.user && this.config.auth.pass;
  }

  /**
   * Inicializar conexión IMAP
   */
  async connect() {
    if (!this.isConfigured()) {
      return false;
    }

    // Asegurarse de desconectar cualquier cliente existente
    await this.disconnect();

    try {
      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
        logger: false,
        // Aumentar timeout para conexiones lentas
        socketTimeout: 60000,
        greetingTimeout: 30000
      });

      // Manejar eventos de error y cierre
      this.client.on('error', (err) => {
        this.isConnected = false;
        // No propagar - se reintenta en checkEmails
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
      this.errorCount = 0;
      
      return true;
    } catch (error) {
      console.error('❌ Email Monitor: Error de conexión:', error.message);
      this.isConnected = false;
      this.errorCount++;
      return false;
    }
  }

  /**
   * Desconectar cliente IMAP
   */
  async disconnect() {
    if (this.client) {
      try {
        // Remover listeners para evitar memory leaks
        this.client.removeAllListeners();
        await this.client.logout();
      } catch (error) {
        // Ignorar errores de desconexión - puede ya estar desconectado
      }
      this.client = null;
    }
    this.isConnected = false;
  }

  /**
   * Iniciar monitoreo de correos
   */
  async start() {
    if (this.isRunning) {
      return { success: false, message: 'El monitor ya está en ejecución' };
    }

    if (!this.isConfigured()) {
      return { 
        success: false, 
        message: 'El monitor no está configurado. Configure las variables EMAIL_MONITOR_USER y EMAIL_MONITOR_PASSWORD' 
      };
    }

    // Conectar inicialmente
    const connected = await this.connect();
    if (!connected) {
      return { success: false, message: 'No se pudo conectar al servidor de correo' };
    }

    this.isRunning = true;

    // Realizar primera revisión inmediatamente
    await this.checkEmails();

    // Programar revisiones periódicas
    this.monitorInterval = setInterval(async () => {
      if (this.errorCount >= this.maxErrors) {
        console.warn('⚠️ Email Monitor: Demasiados errores consecutivos, pausando servicio');
        await this.stop();
        return;
      }
      await this.checkEmails();
    }, this.config.checkInterval);

    return { success: true, message: 'Monitor de correo iniciado' };
  }

  /**
   * Detener monitoreo de correos
   */
  async stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    await this.disconnect();
    this.isRunning = false;
    this.errorCount = 0;

    return { success: true, message: 'Monitor de correo detenido' };
  }

  /**
   * Revisar correos nuevos (busca por fecha reciente, no por estado leído)
   */
  async checkEmails() {
    // Forzar reconexión si no está conectado
    if (!this.isConnected || !this.client) {
      const connected = await this.connect();
      if (!connected) {
        this.errorCount++;
        return;
      }
    }

    try {
      this.lastCheckTime = new Date();
      
      // Abrir INBOX
      const lock = await this.client.getMailboxLock('INBOX');
      
      try {
        // Buscar correos recientes (últimos 15 minutos) del remitente específico
        // Esto funciona incluso si el correo ya está marcado como leído
        const lookbackMinutes = 15;
        const sinceDate = new Date(Date.now() - lookbackMinutes * 60 * 1000);
        
        const messages = [];
        let totalChecked = 0;
        
        // Buscar por fecha (SINCE) y luego filtrar por remitente
        for await (const message of this.client.fetch(
          { since: sinceDate },
          { 
            envelope: true, 
            source: false,
            bodyStructure: true 
          }
        )) {
          totalChecked++;
          const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase() || '';
          
          if (fromAddress.includes(this.config.filterSender.toLowerCase())) {
            const messageId = message.envelope?.messageId;
            const subject = message.envelope?.subject || 'Sin asunto';
            
            // Verificar si ya procesamos este correo (en BD)
            const alreadyProcessed = await this.isEmailProcessed(messageId);
            
            if (!alreadyProcessed) {
              messages.push(message);
            }
          }
        }

        if (messages.length > 0) {
          for (const message of messages) {
            await this.processEmail(message);
          }
        }

        this.errorCount = 0;
      } finally {
        try {
          lock.release();
        } catch (e) {
          // Ignorar error al liberar lock - conexión puede estar cerrada
        }
      }
    } catch (error) {
      console.error('❌ Error revisando correos:', error.message);
      this.errorCount++;
      // Forzar desconexión limpia para que el próximo ciclo reconecte
      await this.disconnect();
    }
  }

  /**
   * Verificar si un correo ya fue procesado (en BD)
   */
  async isEmailProcessed(messageId) {
    if (!messageId) return false;
    try {
      const result = await pool.query(
        'SELECT 1 FROM processed_emails WHERE message_id = $1 LIMIT 1',
        [messageId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('⚠️ Error verificando email procesado:', error.message);
      return false;
    }
  }

  /**
   * Marcar correo como procesado (en BD)
   */
  async markEmailAsProcessed(messageId, externalTicketId, subject, fromAddress) {
    if (!messageId) return;
    try {
      await pool.query(
        `INSERT INTO processed_emails (message_id, external_ticket_id, subject, from_address)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId, externalTicketId, subject, fromAddress]
      );
    } catch (error) {
      console.error('⚠️ Error guardando email procesado:', error.message);
    }
  }

  /**
   * Procesar un correo individual
   */
  async processEmail(message) {
    try {
      const messageId = message.envelope?.messageId;
      
      const subject = message.envelope?.subject || 'Sin asunto';
      const from = message.envelope?.from?.[0];
      const fromAddress = from?.address || 'desconocido';
      const fromName = from?.name || fromAddress;
      const date = message.envelope?.date || new Date();

      // Extraer número de ticket externo del asunto
      const ticketMatch = subject.match(this.ticketPattern);
      const externalTicketId = ticketMatch ? ticketMatch[1] : null;

      // Crear notificación para técnicos (incluye messageId para notificación compartida)
      await this.createNotificationForTechnicians({
        messageId,
        externalTicketId,
        subject,
        fromName,
        fromAddress,
        date
      });

      // Marcar correo como procesado en BD (no en memoria)
      await this.markEmailAsProcessed(messageId, externalTicketId, subject, fromAddress);

    } catch (error) {
      console.error('❌ Error procesando correo:', error.message);
    }
  }

  /**
   * Marcar correo como leído
   */
  async markAsRead(uid) {
    try {
      const lock = await this.client.getMailboxLock('INBOX');
      try {
        await this.client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } catch (error) {
      // Error no crítico - el correo igual se procesa
    }
  }

  /**
   * Crear notificación para todos los técnicos
   * Las notificaciones comparten email_message_id para marcado compartido
   */
  async createNotificationForTechnicians({ messageId, externalTicketId, subject, fromName, fromAddress, date }) {
    try {
      // Obtener todos los técnicos activos (solo rol tech)
      const usersResult = await pool.query(`
        SELECT id, username, firstname, lastname 
        FROM users 
        WHERE role = 'tech' 
        AND status = true
      `);

      if (usersResult.rows.length === 0) {
        return;
      }

      // Buscar si existe un ticket interno relacionado con este ticket externo
      let relatedTicketId = null;
      if (externalTicketId) {
        const ticketResult = await pool.query(
          `SELECT id FROM tickets WHERE external_ticket_id = $1 LIMIT 1`,
          [externalTicketId]
        );
        if (ticketResult.rows.length > 0) {
          relatedTicketId = ticketResult.rows[0].id;
        }
      }

      // Mensaje de notificación
      const message = externalTicketId 
        ? `📧 Respuesta de soporte externo - Ticket #${externalTicketId}: ${subject.substring(0, 100)}`
        : `📧 Correo de soporte externo: ${subject.substring(0, 100)}`;

      // Crear notificación para cada técnico (comparten email_message_id)
      const notifications = [];
      for (const user of usersResult.rows) {
        const result = await pool.query(`
          INSERT INTO notifications (user_id, type, message, ticket_id, external_ticket_id, email_subject, email_message_id, is_read, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
          RETURNING id, user_id, type, message, ticket_id, external_ticket_id, email_subject, email_message_id, is_read, created_at
        `, [
          user.id,
          'external_email',
          message,
          relatedTicketId,
          externalTicketId,
          subject,
          messageId  // Compartido entre todos los técnicos
        ]);

        notifications.push({
          ...result.rows[0],
          username: user.username,
          firstname: user.firstname,
          lastname: user.lastname
        });
      }

      // Emitir evento WebSocket a todos los técnicos conectados
      if (this.io) {
        // Emitir evento general
        this.io.emit('external-email-alert', {
          externalTicketId,
          subject,
          fromName,
          fromAddress,
          date,
          relatedTicketId,
          message,
          timestamp: new Date().toISOString()
        });

        // También emitir como notificación normal para que actualice el contador
        for (const notification of notifications) {
          this.io.to(`user-${notification.user_id}`).emit('new-notification', notification);
        }
      }

      // Enviar notificaciones WhatsApp a los técnicos (no bloqueante)
      // El mensaje incluye info del ticket externo
      const whatsappMessage = externalTicketId
        ? `📧 *Respuesta de Soporte Externo*\n\n🎫 *Ticket Externo:* #${externalTicketId}\n📝 *Asunto:* ${subject.substring(0, 100)}\n👤 *De:* ${fromName}\n🕒 *Fecha:* ${new Date(date).toLocaleString('es-CO')}\n\n💡 Revisa la bandeja de entrada para más detalles.`
        : `📧 *Correo de Soporte Externo*\n\n📝 *Asunto:* ${subject.substring(0, 100)}\n👤 *De:* ${fromName}\n🕒 *Fecha:* ${new Date(date).toLocaleString('es-CO')}\n\n💡 Revisa la bandeja de entrada para más detalles.`;

      for (const notification of notifications) {
        // Enviar de forma asíncrona sin bloquear
        setImmediate(async () => {
          try {
            await sendWhatsAppNotification(
              notification.user_id,
              relatedTicketId, // Puede ser null si no hay ticket relacionado
              whatsappMessage,
              'external_email'
            );
          } catch (error) {
            // Error no crítico - la notificación en BD ya fue creada
          }
        });
      }

      return notifications;
    } catch (error) {
      console.error('❌ Error creando notificaciones:', error.message);
      throw error;
    }
  }

  /**
   * Obtener estado del monitor
   */
  async getStatus() {
    // Obtener conteo de correos procesados desde BD
    let processedCount = 0;
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM processed_emails');
      processedCount = parseInt(result.rows[0].count) || 0;
    } catch (error) {
      // Error no crítico - continuar sin conteo
    }

    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      isConfigured: this.isConfigured(),
      lastCheckTime: this.lastCheckTime,
      errorCount: this.errorCount,
      maxErrors: this.maxErrors,
      config: {
        host: this.config.host,
        port: this.config.port,
        user: this.config.auth.user ? this.config.auth.user.replace(/(.{3}).*(@.*)/, '$1***$2') : 'No configurado',
        filterSender: this.config.filterSender,
        checkIntervalSeconds: this.config.checkInterval / 1000
      },
      processedEmailsCount: processedCount
    };
  }

  /**
   * Forzar revisión inmediata
   */
  async forceCheck() {
    if (!this.isRunning) {
      return { success: false, message: 'El monitor no está en ejecución' };
    }

    await this.checkEmails();
    return { 
      success: true, 
      message: 'Revisión completada',
      lastCheckTime: this.lastCheckTime 
    };
  }

  /**
   * Actualizar configuración en caliente
   */
  updateConfig(newConfig) {
    if (newConfig.checkInterval) {
      this.config.checkInterval = parseInt(newConfig.checkInterval);
      
      // Si está corriendo, reiniciar el intervalo
      if (this.isRunning && this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = setInterval(async () => {
          await this.checkEmails();
        }, this.config.checkInterval);
      }
    }

    if (newConfig.filterSender) {
      this.config.filterSender = newConfig.filterSender;
    }

    return this.getStatus();
  }
}

// Exportar instancia singleton
const emailMonitorService = new EmailMonitorService();
export default emailMonitorService;
