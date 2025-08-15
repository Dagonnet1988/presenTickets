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

import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { pool } from '../server.js';
import fs from 'fs';
import path from 'path';

// Logger personalizado para Baileys
const createSilentLogger = () => {
  const silentFn = () => {};
  const logger = {
    level: 'silent',
    error: silentFn,
    warn: silentFn,
    info: silentFn,
    debug: silentFn,
    trace: silentFn,
    child: () => logger
  };
  return logger;
};

class WhatsAppService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.qrCodeCallback = null;
    this.connectionCallback = null;
    this.authFolder = path.join(process.cwd(), 'whatsapp_auth');
    this.currentQRCode = null;
    this.io = null; // Referencia a Socket.IO
    
    // Crear carpeta de autenticación si no existe
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
  }

  /**
   * Configurar Socket.IO
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Inicializar conexión con WhatsApp
   */
  async initialize() {
    try {
      console.log('🔄 Iniciando servicio WhatsApp...');
      
      // Verificar si ya hay una sesión activa
      if (this.isConnected && this.socket) {
        console.log('⚠️ WhatsApp ya está conectado');
        return;
      }
      
      // Configurar estado de autenticación
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
      
      // Crear socket de WhatsApp
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: createSilentLogger(),
        browser: ['PresenTickets', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
          return { conversation: 'Hello!' };
        }
      });

      // Manejar eventos de conexión
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !this.isConnected) {
          console.log('📱 Nuevo código QR generado');
          this.generateQRCode(qr);
        }
        
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
            ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            : true;
          
          console.log('🔌 Conexión cerrada, reconectando...', shouldReconnect);
          
          // Si es un error 401 (Unauthorized), limpiar completamente la sesión
          if (lastDisconnect?.error instanceof Boom && 
              lastDisconnect.error.output.statusCode === 401) {
            console.log('🧹 Sesión expirada - Limpiando archivos...');
            await this.forceCleanAuthFolder();
            this.isConnected = false;
            this.currentQRCode = null;
            
            // Notificar que necesita reautenticación
            if (this.io) {
              this.io.emit('whatsapp-connection-status', { 
                isConnected: false,
                hasSocket: false,
                needsAuth: true,
                error: 'Sesión expirada - Requiere nueva autenticación',
                timestamp: new Date().toISOString()
              });
            }
          }
          
          this.isConnected = false;
          this.socket = null;
          
          if (shouldReconnect) {
            setTimeout(() => this.initialize(), 5000);
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp conectado exitosamente');
          this.isConnected = true;
          this.currentQRCode = null;
          
          // Notificar conexión exitosa a través de WebSocket
          if (this.io) {
            this.io.emit('whatsapp-connection-status', { 
              isConnected: true,
              hasSocket: true,
              timestamp: new Date().toISOString()
            });
          }
          
          if (this.connectionCallback) {
            this.connectionCallback(true);
          }
        }
      });

      // Guardar credenciales cuando se actualicen
      this.socket.ev.on('creds.update', saveCreds);

    } catch (error) {
      console.error('❌ Error al inicializar WhatsApp:', error);
      setTimeout(() => this.initialize(), 10000);
    }
  }

  /**
   * Generar y mostrar código QR
   */
  generateQRCode(qr) {
    // Guardar QR actual
    this.currentQRCode = qr;
    
    // Enviar QR a través de WebSocket si está disponible
    if (this.io) {
      this.io.emit('whatsapp-qr-code', { qrCode: qr });
    }
    
    if (this.qrCodeCallback) {
      this.qrCodeCallback(qr);
    }
  }

  /**
   * Enviar mensaje de WhatsApp
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isConnected || !this.socket) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      // Formatear número de teléfono
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      // Enviar mensaje
      const result = await this.socket.sendMessage(formattedNumber, { text: message });
      
      console.log(`✅ Mensaje enviado a ${phoneNumber}`);
      return result;
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Formatear número de teléfono para WhatsApp
   */
  formatPhoneNumber(phoneNumber) {
    // Remover espacios, guiones y caracteres especiales
    let formatted = phoneNumber.replace(/\D/g, '');
    
    // Si no tiene código de país, agregar código de Colombia (57)
    if (formatted.length === 10) {
      formatted = '57' + formatted;
    }
    
    return formatted + '@s.whatsapp.net';
  }

  /**
   * Enviar notificación de ticket por WhatsApp
   */
  async sendTicketNotification(userId, ticketId, message, notificationType) {
    try {
      // Obtener información del usuario
      const client = await pool.connect();
      const userResult = await client.query(
        'SELECT firstname, lastname, email, phone FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('Usuario no encontrado');
      }
      
      const user = userResult.rows[0];
      const fullName = `${user.firstname || 'Usuario'} ${user.lastname || ''}`.trim();
      
      // Verificar si el usuario tiene número de teléfono
      if (!user.phone) {
        console.log(`⚠️ Usuario ${fullName} sin número de teléfono`);
        return false;
      }

      // Crear mensaje formateado
      const formattedMessage = this.formatTicketMessage(fullName, ticketId, message, notificationType);
      
      // Enviar mensaje
      await this.sendMessage(user.phone, formattedMessage);
      
      // Registrar en base de datos
      await this.logWhatsAppNotification(userId, ticketId, formattedMessage, 'sent', null, user.phone, notificationType);
      
      client.release();
      return true;
      
    } catch (error) {
      console.error('❌ Error enviando notificación WhatsApp:', error);
      // Registrar error en base de datos
      await this.logWhatsAppNotification(userId, ticketId, message, 'failed', error.message, null, notificationType);
      return false;
    }
  }

  /**
   * Formatear mensaje de ticket
   */
  formatTicketMessage(userName, ticketId, message, type) {
    const emoji = this.getNotificationEmoji(type);
    const timestamp = new Date().toLocaleString('es-CO');
    
    return `${emoji} *PresenTickets - Clínica La Presentación*

Hola ${userName},

${message}

🎫 *Ticket #${ticketId}*
🕒 ${timestamp}

Para más detalles, ingresa al sistema PresenTickets.

_Este es un mensaje automático, no responder._`;
  }

  /**
   * Obtener emoji según tipo de notificación
   */
  getNotificationEmoji(type) {
    const emojis = {
      'nuevo_ticket': '🆕',
      'ticket_asignado': '👤',
      'cambio_estado': '🔄',
      'ticket_reabierto': '🔁',
      'comentario': '💬',
      'admin_comentario': '👨‍💼',
      'maintenance': '🔧',
      'general': '📢'
    };
    
    return emojis[type] || '📨';
  }

  /**
   * Registrar notificación en base de datos
   */
  async logWhatsAppNotification(userId, ticketId, message, status, error = null, phoneNumber = null, notificationType = 'unknown') {
    try {
      const client = await pool.connect();
      await client.query(`
        INSERT INTO whatsapp_notifications 
        (user_id, ticket_id, message, status, error_message, phone_number, notification_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [userId, ticketId, message, status, error, phoneNumber, notificationType]);
      client.release();
    } catch (dbError) {
      console.error('❌ Error registrando notificación WhatsApp en BD:', dbError);
    }
  }

  /**
   * Verificar estado de conexión
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasSocket: !!this.socket,
      timestamp: new Date().toISOString(),
      currentQRCode: this.currentQRCode
    };
  }

  /**
   * Desconectar WhatsApp
   */
  async disconnect() {
    try {
      console.log('🔌 Desconectando WhatsApp...');
      
      // Limpiar estado de conexión inmediatamente
      this.isConnected = false;
      this.currentQRCode = null;
      
      // Si hay un socket activo, intentar logout
      if (this.socket) {
        try {
          await this.socket.logout();
        } catch (logoutError) {
          console.warn('⚠️ Error durante logout:', logoutError.message);
        }
        
        // Cerrar el socket de manera forzada
        try {
          if (this.socket.ws && this.socket.ws.readyState === 1) {
            this.socket.ws.close();
          }
        } catch (wsError) {
          // Silenciar error de cierre de WebSocket
        }
        
        this.socket = null;
      }

      // Limpiar archivos de autenticación
      await this.forceCleanAuthFolder();
      
      // Notificar desconexión a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', { 
          isConnected: false,
          hasSocket: false,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('✅ WhatsApp desconectado correctamente');
    } catch (error) {
      console.error('❌ Error durante desconexión:', error);
      // Limpiar de todas formas
      this.socket = null;
      this.isConnected = false;
      this.currentQRCode = null;
      await this.forceCleanAuthFolder();
    }
  }

  /**
   * Reconectar WhatsApp desde cero
   */
  async reconnect() {
    try {
      console.log('🔄 Reconectando WhatsApp...');
      
      // Primero desconectar si existe conexión
      await this.disconnect();
      
      // Esperar un momento antes de reconectar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Inicializar nueva conexión
      await this.initialize();
      
    } catch (error) {
      console.error('❌ Error durante reconexión:', error);
      throw error;
    }
  }

  /**
   * Limpiar carpeta de autenticación
   */
  clearAuthFolder() {
    try {
      if (fs.existsSync(this.authFolder)) {
        const files = fs.readdirSync(this.authFolder);
        for (const file of files) {
          const filePath = path.join(this.authFolder, file);
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('❌ Error limpiando archivos de autenticación:', error);
    }
  }

  /**
   * Limpiar carpeta de autenticación de forma más agresiva
   */
  async forceCleanAuthFolder() {
    try {
      console.log('🧹 Limpiando archivos de autenticación...');
      
      if (fs.existsSync(this.authFolder)) {
        const files = fs.readdirSync(this.authFolder);
        
        for (const file of files) {
          const filePath = path.join(this.authFolder, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              fs.unlinkSync(filePath);
            } else if (stats.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            }
          } catch (fileError) {
            // Intentar eliminar con force
            try {
              fs.rmSync(filePath, { force: true });
            } catch (forceError) {
              console.error(`❌ No se pudo eliminar ${file}`);
            }
          }
        }
        
        // Recrear la carpeta vacía
        fs.rmSync(this.authFolder, { recursive: true, force: true });
        fs.mkdirSync(this.authFolder, { recursive: true });
        console.log('✅ Archivos de autenticación eliminados');
      } else {
        // Crear la carpeta si no existe
        fs.mkdirSync(this.authFolder, { recursive: true });
      }
    } catch (error) {
      console.error('❌ Error en limpieza:', error);
      // Último intento: recrear desde cero
      try {
        if (fs.existsSync(this.authFolder)) {
          fs.rmSync(this.authFolder, { recursive: true, force: true });
        }
        fs.mkdirSync(this.authFolder, { recursive: true });
      } catch (lastError) {
        console.error('💥 Error crítico en limpieza:', lastError);
      }
    }
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  async getNotificationStats() {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT 
          status,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY status, DATE(created_at)
        ORDER BY date DESC
      `);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas WhatsApp:', error);
      return [];
    }
  }

  /**
   * Configurar callbacks
   */
  onQRCode(callback) {
    this.qrCodeCallback = callback;
  }

  onConnection(callback) {
    this.connectionCallback = callback;
  }
}

// Instancia singleton
const whatsappService = new WhatsAppService();

export default whatsappService;
