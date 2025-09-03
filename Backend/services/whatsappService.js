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
    this.isInitializing = false; // Nueva bandera para prevenir inicializaciones múltiples
    this.qrCodeCallback = null;
    this.connectionCallback = null;
    this.authFolder = path.join(process.cwd(), 'whatsapp_auth');
    this.currentQRCode = null;
    this.io = null; // Referencia a Socket.IO
    
    // Rate limiting para prevenir bloqueos de WhatsApp
    this.lastMessageTime = 0;
    this.messageCount = 0;
    this.dailyMessageCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.messageQueue = [];
    this.processingQueue = false;
    
    // Configuración de límites de seguridad anti-detección (CARGADOS DESDE BD)
    this.rateLimits = {
      minDelayBetweenMessages: 1000, // Se cargará desde BD
      maxDelayBetweenMessages: 3000, // Se cargará desde BD
      maxMessagesPerHour: 60,        // Se cargará desde BD
      maxDailyMessages: 200,         // Se cargará desde BD
      maxBurstMessages: 5            // Se cargará desde BD
    };
    
    // NO cargar configuración aquí - se hará después cuando pool esté disponible
    
    // Crear carpeta de autenticación si no existe
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
  }

  /**
   * Inicializar servicio WhatsApp (debe llamarse después de que pool esté disponible)
   */
  async initialize() {
    try {
      
      // Cargar configuración de antibloqueo desde BD
      await this.loadAntiBlockConfigFromDB();
      
      // Sincronizar contadores con datos reales de la BD
      await this.syncCountersWithDB();
      
      // Inicializar conexión de WhatsApp automáticamente
      await this.initializeConnection();
      
      return true;
    } catch (error) {
      console.error('❌ Error inicializando servicio WhatsApp:', error);
      return false;
    }
  }

  /**
   * Cargar configuración de antibloqueo desde la base de datos
   */
  async loadAntiBlockConfigFromDB() {
    try {
      // Verificar que pool esté disponible
      if (!pool) {
        return;
      }

      const client = await pool.connect();
      const result = await client.query(`
        SELECT 
          whatsapp_min_delay,
          whatsapp_max_delay,
          whatsapp_max_hour,
          whatsapp_max_daily,
          whatsapp_max_burst
        FROM system_settings 
        WHERE id = 1
      `);
      
      if (result.rows.length > 0) {
        const config = result.rows[0];
        this.rateLimits.minDelayBetweenMessages = config.whatsapp_min_delay || 1000;
        this.rateLimits.maxDelayBetweenMessages = config.whatsapp_max_delay || 3000;
        this.rateLimits.maxMessagesPerHour = config.whatsapp_max_hour || 60;
        this.rateLimits.maxDailyMessages = config.whatsapp_max_daily || 200;
        this.rateLimits.maxBurstMessages = config.whatsapp_max_burst || 5;
      }
      
      client.release();
    } catch (error) {
      console.error('❌ Error cargando configuración de antibloqueo desde BD:', error);
    }
  }

  /**
   * Guardar configuración de antibloqueo en la base de datos
   */
  async saveAntiBlockConfigToDB() {
    try {
      // Verificar que pool esté disponible
      if (!pool) {
        console.error('❌ Pool de BD no disponible para guardar configuración');
        return false;
      }

      const client = await pool.connect();
      await client.query(`
        UPDATE system_settings SET
          whatsapp_min_delay = $1,
          whatsapp_max_delay = $2,
          whatsapp_max_hour = $3,
          whatsapp_max_daily = $4,
          whatsapp_max_burst = $5,
          updated_at = NOW()
        WHERE id = 1
      `, [
        this.rateLimits.minDelayBetweenMessages,
        this.rateLimits.maxDelayBetweenMessages,
        this.rateLimits.maxMessagesPerHour,
        this.rateLimits.maxDailyMessages,
        this.rateLimits.maxBurstMessages
      ]);
      
            client.release();
      return true;
    } catch (error) {
      console.error('❌ Error guardando configuración de antibloqueo en BD:', error);
      return false;
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
  async initializeConnection() {
    try {
      
      this.isInitializing = true;
      
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
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        getMessage: async (key) => {
          return { conversation: 'Hello!' };
        }
      });

      // Manejar errores de sesión y contadores de mensajes
      this.socket.ev.on('CB:call', (data) => {
        // Ignorar llamadas para evitar logs innecesarios
      });

      // Manejar errores de descifrado y sesión
      this.socket.ev.process(async (events) => {
        if (events['messages.upsert']) {
          const { messages } = events['messages.upsert'];
          for (const msg of messages) {
            try {
              // Procesar mensaje normalmente
            } catch (error) {
              if (error.message?.includes('MessageCounterError') || 
                  error.message?.includes('Key used already') ||
                  error.message?.includes('Failed to decrypt')) {
                console.log('🔄 Error de sesión detectado, limpiando sesión corrupta...');
                await this.handleSessionError();
                return;
              }
            }
          }
        }
      });

      // Manejar eventos de conexión
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !this.isConnected) {
                    this.generateQRCode(qr);
        }
        
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
            ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            : true;
          
                    // Si es un error 401 (Unauthorized), limpiar completamente la sesión
          if (lastDisconnect?.error instanceof Boom && 
              lastDisconnect.error.output.statusCode === 401) {
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
          this.isInitializing = false; // Limpiar la bandera cuando se desconecte
          
          if (shouldReconnect) {
            setTimeout(() => this.initializeConnection(), 5000);
          }
        } else if (connection === 'open') {
                    this.isConnected = true;
          this.currentQRCode = null;
          this.isInitializing = false; // Limpiar bandera al conectar exitosamente
          
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
      this.isInitializing = false; // Limpiar bandera en caso de error
      setTimeout(() => this.initializeConnection(), 10000);
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
   * Enviar mensaje de WhatsApp con rate limiting inteligente
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isConnected || !this.socket) {
      throw new Error('WhatsApp no está conectado');
    }

    // Verificar límites de seguridad
    const canSend = await this.checkRateLimits();
    if (!canSend) {
      throw new Error('Límite de mensajes alcanzado. Esperando para evitar bloqueo de WhatsApp.');
    }

    try {
      // Aplicar delay aleatorio para simular comportamiento humano
      await this.applyHumanLikeDelay();
      
      // Formatear número de teléfono
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      // Enviar mensaje
      const result = await this.socket.sendMessage(formattedNumber, { text: message });
      
      // Actualizar contadores
      this.updateMessageCounters();
      
            return result;
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Sincronizar contadores con base de datos real
   */
  async syncCountersWithDB() {
    try {
      if (!pool) {
        console.warn('⚠️ Pool de BD no disponible para sincronizar contadores');
        return;
      }

      const client = await pool.connect();
      const now = new Date();
      
      // Usar zona horaria de Colombia para las consultas
      const colombiaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
      const today = colombiaTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const oneHourAgo = new Date(colombiaTime.getTime() - (60 * 60 * 1000));

      // Contar mensajes enviados hoy desde la base de datos (zona horaria Colombia)
      const dailyResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_notifications 
        WHERE status = 'sent' 
        AND DATE(created_at AT TIME ZONE 'America/Bogota') = $1
      `, [today]);

      // Contar mensajes enviados en la última hora desde la base de datos
      const hourlyResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_notifications 
        WHERE status = 'sent' 
        AND created_at >= $1
      `, [oneHourAgo]);

      // Actualizar contadores en memoria con datos reales de la BD
      this.dailyMessageCount = parseInt(dailyResult.rows[0].count) || 0;
      this.messageCount = parseInt(hourlyResult.rows[0].count) || 0;
      this.lastResetDate = today;
      
      client.release();
    } catch (error) {
      console.error('❌ Error sincronizando contadores con BD:', error);
    }
  }

  /**
   * Verificar límites de rate limiting
   */
  async checkRateLimits() {
    // Sincronizar contadores con la base de datos real antes de verificar límites
    await this.syncCountersWithDB();
    
    const now = new Date();
    const today = now.toDateString();
    
    // El reset se hace en syncCountersWithDB(), pero mantenemos esta verificación por seguridad
    if (this.lastResetDate !== today) {
      this.lastResetDate = today;
      // Los contadores ya se actualizaron en syncCountersWithDB()
    }
    
    // Verificar límite diario
    if (this.dailyMessageCount >= this.rateLimits.maxDailyMessages) {
      console.warn(`⚠️ Límite diario de ${this.rateLimits.maxDailyMessages} mensajes alcanzado (actual: ${this.dailyMessageCount})`);
      return false;
    }
    
    // Verificar límite por hora
    if (this.messageCount >= this.rateLimits.maxMessagesPerHour) {
      console.warn(`⚠️ Límite horario de ${this.rateLimits.maxMessagesPerHour} mensajes alcanzado (actual: ${this.messageCount})`);
      return false;
    }
    
    return true;
  }

  /**
   * Aplicar delay aleatorio para simular comportamiento humano
   */
  async applyHumanLikeDelay() {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    
    // Calcular delay necesario
    let delay = 0;
    
    if (this.messageCount > 0 && this.messageCount % this.rateLimits.maxBurstMessages === 0) {
      // Después de una ráfaga, pausa moderada (10-20 segundos) - Reducido de 30-60s
      delay = Math.random() * 10000 + 10000;
          } else {
      // Delay normal entre mensajes
      const minDelay = this.rateLimits.minDelayBetweenMessages;
      const maxDelay = this.rateLimits.maxDelayBetweenMessages;
      delay = Math.random() * (maxDelay - minDelay) + minDelay;
      
      // Si el último mensaje fue hace poco, ajustar delay
      if (timeSinceLastMessage < minDelay) {
        delay = minDelay - timeSinceLastMessage;
      }
    }
    
    if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Actualizar contadores de mensajes
   */
  updateMessageCounters() {
    const now = Date.now();
    this.lastMessageTime = now;
    
    // Solo incrementar contadores en memoria 
    // (la sincronización real con BD se hace en checkRateLimits)
    this.messageCount++;
    this.dailyMessageCount++;
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
      
      // Verificar configuración global de WhatsApp
      const globalConfigResult = await client.query(`
        SELECT 
          whatsapp_global_enabled,
          whatsapp_global_ticket_created,
          whatsapp_global_ticket_assigned,
          whatsapp_global_ticket_status,
          whatsapp_global_comments
        FROM system_settings 
        WHERE id = 1
        LIMIT 1
      `);

      let globalConfig = null;
      if (globalConfigResult.rows.length > 0) {
        globalConfig = globalConfigResult.rows[0];
      } else {
        // Si no hay configuración, usar valores por defecto (todos habilitados)
        globalConfig = {
          whatsapp_global_enabled: true,
          whatsapp_global_ticket_created: true,
          whatsapp_global_ticket_assigned: true,
          whatsapp_global_ticket_status: true,
          whatsapp_global_comments: true
        };
      }

      // Verificar si WhatsApp está habilitado globalmente
      if (!globalConfig.whatsapp_global_enabled) {
                await this.logWhatsAppNotification(userId, ticketId, message, 'skipped', 'Notificaciones WhatsApp deshabilitadas globalmente', null, notificationType);
        client.release();
        return false;
      }

      // Verificar si este tipo específico de notificación está habilitado
      let isTypeEnabled = true;
      switch (notificationType) {
        case 'nuevo_ticket':
        case 'new_ticket':
          isTypeEnabled = globalConfig.whatsapp_global_ticket_created;
          break;
        case 'ticket_asignado':
        case 'ticket_assigned':
          isTypeEnabled = globalConfig.whatsapp_global_ticket_assigned;
          break;
        case 'cambio_estado':
        case 'status_change':
          isTypeEnabled = globalConfig.whatsapp_global_ticket_status;
          break;
        case 'comentario':
        case 'comentario_user':
        case 'comentario_tech':
        case 'comment':
        case 'admin_comentario':
          isTypeEnabled = globalConfig.whatsapp_global_comments;
          break;
        default:
          // Para tipos no reconocidos, permitir envío si WhatsApp está habilitado globalmente
          isTypeEnabled = true;
      }

      if (!isTypeEnabled) {
        console.log(`⚠️ Notificaciones tipo "${notificationType}" deshabilitadas en configuración global`);
        await this.logWhatsAppNotification(userId, ticketId, message, 'skipped', `Notificaciones tipo "${notificationType}" deshabilitadas en configuración global`, null, notificationType);
        client.release();
        return false;
      }

      // Verificar horario laboral
      const inBusinessHours = await this.isBusinessHours();
      if (!inBusinessHours) {
        console.log(`⚠️ Notificación omitida: fuera de horario laboral`);
        await this.logWhatsAppNotification(userId, ticketId, message, 'skipped', 'Envío fuera de horario laboral', null, notificationType);
        client.release();
        return false;
      }

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
        client.release();
        return false;
      }

      // Obtener información adicional del ticket
      const ticketResult = await client.query(
        'SELECT title FROM tickets WHERE id = $1',
        [ticketId]
      );

      const ticketSubject = ticketResult.rows.length > 0 ? ticketResult.rows[0].title : 'Sin asunto';

      // Crear mensaje formateado usando plantillas personalizadas
      const formattedMessage = await this.formatTicketMessageFromTemplate(
        fullName, 
        ticketId, 
        ticketSubject,
        message, 
        notificationType,
        client
      );
      
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
   * Formatear mensaje usando plantillas variadas (sin personalización DB)
   */
  async formatTicketMessageFromTemplate(userName, ticketId, ticketSubject, message, notificationType, client) {
    try {
      // Usar directamente las plantillas variadas sin consultar la DB
      const template = this.getRandomTemplate(notificationType, ticketId);

      // Reemplazar variables en la plantilla
      const timestamp = new Date().toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      let formattedMessage = template
        .replace(/{userName}/g, userName)
        .replace(/{ticketId}/g, ticketId)
        .replace(/{subject}/g, ticketSubject)
        .replace(/{timestamp}/g, timestamp)
        .replace(/{comment}/g, message || 'Sin comentario')
        .replace(/{newStatus}/g, message || 'Sin estado');

      return formattedMessage;

    } catch (error) {
      console.error('Error al formatear mensaje:', error);
      // Fallback simple
      return `Hola ${userName}, actualización en ticket #${ticketId}: ${message}`;
    }
  }

  /**
   * Obtener plantilla por defecto con variaciones para evitar detección
   */
  getRandomTemplate(notificationType) {
    // Plantillas múltiples para cada tipo para evitar patrones repetitivos
    const templateVariations = {
      'nuevo_ticket': [
        '🆕 *Clínica La Presentación*\n─────────────────\n 📋 NUEVO TICKET     \n─────────────────\n\nHola {userName},\n\n🎫 Ticket: #{ticketId}\n📄 Asunto: {subject}\n⏰ Creado: {timestamp}\n\n─────────────────\n⚠️ *No responder a este mensaje*\nPara gestionar el ticket accede al sistema.',
        '📋 *PresenTickets*\n════════════════\n🆕 TICKET REGISTRADO\n════════════════\n\n¡Hola {userName}!\n\n🎫 #{ticketId} - {subject}\n📅 {timestamp}\n\n─────────────────\n🚫 *Mensaje automático*\nNo responder. Usa el sistema para seguimiento.',
        '🎫 *Sistema de Tickets*\n━━━━━━━━━━━━━━━━\n  📋 TICKET CREADO   \n━━━━━━━━━━━━━━━━\n\nHola {userName},\n\n✅ Ticket #{ticketId} registrado\n📄 {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *Este es un mensaje automático*\nNo responder. Gestiona desde el portal.'
      ],
      
      'ticket_asignado': [
        '👤 *Asignación de Ticket*\n─────────────────\n 🔧 TÉCNICO ASIGNADO \n─────────────────\n\nHola {userName},\n\n🎫 Ticket: #{ticketId}\n📋 {subject}\n👨‍💻 Un técnico fue asignado\n⏰ {timestamp}\n\n─────────────────\n⚠️ *No responder a este mensaje*\nPara gestionar el ticket accede al sistema.',
        '🔔 *PresenTickets*\n════════════════\n👤 TICKET ASIGNADO\n════════════════\n\n{userName}, se asignó técnico:\n\n🎫 #{ticketId}\n📋 {subject}\n📅 {timestamp}\n\n─────────────────\n🚫 *Mensaje automático*\nNo responder. Usa el sistema para seguimiento.',
        '📌 *Ticket Asignado*\n━━━━━━━━━━━━━━━━\n 🔧 TÉCNICO ASIGNADO \n━━━━━━━━━━━━━━━━\n\nHola {userName},\n\n✅ Ticket #{ticketId} asignado\n📄 {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *Este es un mensaje automático*\nNo responder. Gestiona desde el portal.'
      ],
      
      'cambio_estado': [
        '🔄 *Actualización de Ticket*\n─────────────────\n 📊 CAMBIO DE ESTADO \n─────────────────\n\nHola {userName},\n\n🎫 Ticket: #{ticketId}\n📈 Estado: {newStatus}\n📄 {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *No responder a este mensaje*\nPara gestionar el ticket accede al sistema.',
        '📈 *Estado Actualizado*\n════════════════\n🔄 TICKET ACTUALIZADO\n════════════════\n\n{userName}, nuevo estado:\n\n🎫 #{ticketId}: {newStatus}\n📝 {subject}\n📅 {timestamp}\n\n─────────────────\n🚫 *Mensaje automático*\nNo responder. Usa el sistema para seguimiento.',
        '🔄 *PresenTickets*\n━━━━━━━━━━━━━━━━\n 📊 ESTADO CAMBIADO  \n━━━━━━━━━━━━━━━━\n\nHola {userName},\n\n✅ #{ticketId}: {newStatus}\n📄 {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *Este es un mensaje automático*\nNo responder. Gestiona desde el portal.'
      ],
      
      'comentario': [
        '💬 *Nuevo Comentario*\n─────────────────\n 💭 COMENTARIO NUEVO \n─────────────────\n\nHola {userName},\n\n💬 "Mensaje: {comment}"\n🎫 Ticket: #{ticketId}\n📋 {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *No responder a este mensaje*\nPara gestionar el ticket accede al sistema.',
        '💭 *PresenTickets*\n════════════════\n💬 NUEVO COMENTARIO\n════════════════\n\n{userName}, comentario agregado:\n\n💭 "Mensaje: {comment}"\n🎫 #{ticketId} - {subject}\n📅 {timestamp}\n\n─────────────────\n🚫 *Mensaje automático*\nNo responder. Usa el sistema para seguimiento.',
        '💭 *Comentario Agregado*\n━━━━━━━━━━━━━━━━\n 💬 NUEVO COMENTARIO \n━━━━━━━━━━━━━━━━\n\nHola {userName},\n\n💭 "Mensaje: {comment}"\n📄 Ticket #{ticketId}: {subject}\n⏰ {timestamp}\n\n─────────────────\n⚠️ *Este es un mensaje automático*\nNo responder. Gestiona desde el portal.'
      ]
    };

    // Mapear tipos alternativos
    const typeMapping = {
      'new_ticket': 'nuevo_ticket',
      'ticket_assigned': 'ticket_asignado', 
      'status_change': 'cambio_estado',
      'ticket_reabierto': 'cambio_estado',
      'comentario_user': 'comentario',
      'comentario_tech': 'comentario',
      'comentario_admin': 'comentario',
      'admin_comentario': 'comentario',
      'comment': 'comentario'
    };

    const mappedType = typeMapping[notificationType] || notificationType;
    const variations = templateVariations[mappedType] || templateVariations['comentario'];
    
    // Selección verdaderamente aleatoria (no basada en tiempo para evitar patrones)
    const randomIndex = Math.floor(Math.random() * variations.length);
    return variations[randomIndex];
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
   * Obtener límites de rate limiting actuales
   */
  getRateLimits() {
    return this.rateLimits;
  }

  /**
   * Verificar estado de conexión con estadísticas de uso
   */
  async getConnectionStatus() {
    // Sincronizar contadores con la BD antes de devolver el estado
    await this.syncCountersWithDB();
    
    const now = new Date();
    const lastResetFormatted = this.lastResetDate || 'No establecido';
    const lastMessageFormatted = this.lastMessageTime ? new Date(this.lastMessageTime).toLocaleString('es-CO') : 'Nunca';
    
    return {
      isConnected: this.isConnected,
      hasSocket: !!this.socket,
      timestamp: now.toISOString(),
      currentQRCode: this.currentQRCode,
      // Estadísticas de uso para monitoreo (sincronizadas con BD)
      dailyMessageCount: this.dailyMessageCount,
      lastMessageTime: this.lastMessageTime,
      lastResetDate: lastResetFormatted,
      lastMessageFormatted: lastMessageFormatted,
      rateLimitStatus: {
        dailyLimit: this.rateLimits.maxDailyMessages,
        dailyUsed: this.dailyMessageCount,
        dailyRemaining: this.rateLimits.maxDailyMessages - this.dailyMessageCount,
        hourlyLimit: this.rateLimits.maxMessagesPerHour,
        hourlyUsed: this.messageCount,
        hourlyRemaining: this.rateLimits.maxMessagesPerHour - this.messageCount
      },
      sync: {
        note: 'Contadores sincronizados con BD en cada verificación de límites'
      }
    };
  }

  /**
   * Obtener estadísticas detalladas del historial de WhatsApp
   */
  async getWhatsAppStats() {
    try {
      if (!pool) {
        return { error: 'Pool de BD no disponible' };
      }

      const client = await pool.connect();
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

      // Estadísticas de hoy
      const todayStats = await client.query(`
        SELECT 
          status,
          COUNT(*) as count,
          notification_type
        FROM whatsapp_notifications 
        WHERE DATE(created_at) = $1
        GROUP BY status, notification_type
        ORDER BY status, notification_type
      `, [today]);

      // Estadísticas de la última hora
      const hourlyStats = await client.query(`
        SELECT 
          status,
          COUNT(*) as count,
          notification_type
        FROM whatsapp_notifications 
        WHERE created_at >= $1
        GROUP BY status, notification_type
        ORDER BY status, notification_type
      `, [oneHourAgo]);

      // Últimos 10 mensajes para verificación
      const recentMessages = await client.query(`
        SELECT 
          id,
          user_id,
          ticket_id,
          status,
          notification_type,
          phone_number,
          created_at,
          SUBSTRING(message, 1, 50) as message_preview
        FROM whatsapp_notifications 
        WHERE DATE(created_at) = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [today]);

      client.release();

      return {
        today: {
          date: today,
          byStatus: todayStats.rows,
          total: todayStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          sent: todayStats.rows.filter(row => row.status === 'sent').reduce((sum, row) => sum + parseInt(row.count), 0)
        },
        lastHour: {
          since: oneHourAgo.toLocaleString('es-CO'),
          byStatus: hourlyStats.rows,
          total: hourlyStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          sent: hourlyStats.rows.filter(row => row.status === 'sent').reduce((sum, row) => sum + parseInt(row.count), 0)
        },
        recentMessages: recentMessages.rows,
        memoryCounters: {
          dailyMessageCount: this.dailyMessageCount,
          hourlyMessageCount: this.messageCount,
          lastMessageTime: this.lastMessageTime ? new Date(this.lastMessageTime).toLocaleString('es-CO') : 'Nunca'
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas de WhatsApp:', error);
      return { error: error.message };
    }
  }

  /**
   * Obtener recomendaciones de seguridad
   */
  getSecurityRecommendations() {
    const recommendations = [];
    
    if (this.dailyMessageCount > this.rateLimits.maxDailyMessages * 0.8) {
      recommendations.push('⚠️ Cerca del límite diario. Considere reducir envíos.');
    }
    
    if (this.messageCount > this.rateLimits.maxMessagesPerHour * 0.9) {
      recommendations.push('⚠️ Cerca del límite horario. Pausa recomendada.');
    }
    
    if (this.dailyMessageCount === 0) {
      recommendations.push('✅ Número listo para envíos. Comience gradualmente.');
    }
    
    if (this.dailyMessageCount < 10) {
      recommendations.push('✅ Uso conservador. Puede aumentar gradualmente.');
    }
    
    return recommendations;
  }

  /**
   * Desconectar WhatsApp
   */
  async disconnect() {
    try {
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
            // Primero desconectar si existe conexión
      await this.disconnect();
      
      // Esperar un momento antes de reconectar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Inicializar nueva conexión
      await this.initializeConnection();
      
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
  async getNotificationStats(period = '7') {
    try {
      const client = await pool.connect();
      
      // Validar período
      const validPeriods = ['7', '30', '90', '365'];
      const days = validPeriods.includes(period) ? period : '7';
      
      // Obtener totales por estado (respetando el período)
      const totalsResult = await client.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY status
        ORDER BY status
      `);
      
      // Obtener tendencias por día
      const trendsResult = await client.query(`
        SELECT 
          status,
          COUNT(*) as count,
          TO_CHAR(created_at, 'YYYY-MM-DD') as date,
          TO_CHAR(created_at, 'DD/MM') as date_formatted
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY status, DATE(created_at), TO_CHAR(created_at, 'YYYY-MM-DD'), TO_CHAR(created_at, 'DD/MM')
        ORDER BY date DESC
      `);
      
      client.release();
      
      // Procesar datos para el frontend
      const stats = {
        period: `${days} días`,
        totals: {
          sent: 0,
          failed: 0,
          pending: 0
        },
        trends: trendsResult.rows,
        lastUpdate: new Date().toLocaleString('es-ES', { 
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      };
      
      // Agrupar totales por estado
      totalsResult.rows.forEach(row => {
        switch(row.status) {
          case 'sent':
            stats.totals.sent = parseInt(row.count);
            break;
          case 'failed':
            stats.totals.failed = parseInt(row.count);
            break;
          case 'pending':
            stats.totals.pending = parseInt(row.count);
            break;
        }
      });
      
      return stats;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas WhatsApp:', error);
      return {
        period: '7 días',
        totals: { sent: 0, failed: 0, pending: 0 },
        trends: [],
        lastUpdate: new Date().toLocaleString('es-ES'),
        error: 'Error al cargar estadísticas'
      };
    }
  }

  /**
   * Obtener estadísticas anti-bloqueo y rate limiting
   */
  getAntiBlockStats() {
    const now = new Date();
    const today = now.toDateString();
    
    // Resetear si es nuevo día
    if (this.lastResetDate !== today) {
      this.dailyMessageCount = 0;
      this.messageCount = 0;
      this.lastResetDate = today;
    }

    return {
      // Límites configurados
      limits: this.rateLimits,
      
      // Uso actual
      usage: {
        dailyMessages: this.dailyMessageCount,
        hourlyMessages: this.messageCount,
        lastMessageTime: this.lastMessageTime,
        lastResetDate: this.lastResetDate
      },
      
      // Capacidad restante
      remaining: {
        dailyRemaining: Math.max(0, this.rateLimits.maxDailyMessages - this.dailyMessageCount),
        hourlyRemaining: Math.max(0, this.rateLimits.maxMessagesPerHour - this.messageCount),
        dailyPercentageUsed: Math.round((this.dailyMessageCount / this.rateLimits.maxDailyMessages) * 100),
        hourlyPercentageUsed: Math.round((this.messageCount / this.rateLimits.maxMessagesPerHour) * 100)
      },
      
      // Estado de seguridad
      safetyStatus: this.getSafetyStatus(),
      
      // Próximo envío permitido
      nextAllowedSend: this.getNextAllowedSendTime(),
      
      // Recomendaciones
      recommendations: this.getSecurityRecommendations()
    };
  }

  /**
   * Obtener estado de seguridad
   */
  getSafetyStatus() {
    const dailyUsage = (this.dailyMessageCount / this.rateLimits.maxDailyMessages) * 100;
    const hourlyUsage = (this.messageCount / this.rateLimits.maxMessagesPerHour) * 100;
    
    if (dailyUsage >= 90 || hourlyUsage >= 90) {
      return { level: 'danger', message: 'Límite casi alcanzado - Alto riesgo', color: 'red' };
    } else if (dailyUsage >= 70 || hourlyUsage >= 70) {
      return { level: 'warning', message: 'Uso moderado - Precaución', color: 'orange' };
    } else if (dailyUsage >= 50 || hourlyUsage >= 50) {
      return { level: 'caution', message: 'Uso normal - Monitorear', color: 'yellow' };
    } else {
      return { level: 'safe', message: 'Uso seguro - OK para enviar', color: 'green' };
    }
  }

  /**
   * Calcular próximo momento permitido para envío
   */
  getNextAllowedSendTime() {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    const minDelay = this.rateLimits.minDelayBetweenMessages;
    
    if (timeSinceLastMessage < minDelay) {
      const waitTime = minDelay - timeSinceLastMessage;
      return new Date(now + waitTime).toISOString();
    }
    
    return new Date(now).toISOString(); // Puede enviar ahora
  }

  /**
   * Obtener estadísticas detalladas de notificaciones WhatsApp
   */
  async getDetailedStats(period = '30') {
    try {
      const client = await pool.connect();
      
      // Estadísticas generales por período
      const generalStatsQuery = `
        SELECT 
          status,
          notification_type,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY status, notification_type
        ORDER BY count DESC
      `;
      
      // Estadísticas por día
      const dailyStatsQuery = `
        SELECT 
          DATE(created_at) as date,
          status,
          COUNT(*) as count
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY DATE(created_at), status
        ORDER BY date DESC
      `;
      
      // Estadísticas por tipo de notificación
      const typeStatsQuery = `
        SELECT 
          notification_type,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
          ROUND(COUNT(CASE WHEN status = 'sent' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY notification_type
        ORDER BY total DESC
      `;
      
      // Usuarios más activos (que más notificaciones reciben)
      const topUsersQuery = `
        SELECT 
          u.firstname || ' ' || u.lastname as full_name,
          u.phone,
          COUNT(*) as notification_count,
          COUNT(CASE WHEN wn.status = 'sent' THEN 1 END) as sent_count,
          COUNT(CASE WHEN wn.status = 'failed' THEN 1 END) as failed_count
        FROM whatsapp_notifications wn
        INNER JOIN users u ON wn.user_id = u.id
        WHERE wn.created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY u.id, u.firstname, u.lastname, u.phone
        ORDER BY notification_count DESC
        LIMIT 10
      `;
      
      // Resumen por horario (horas del día)
      const hourlyStatsQuery = `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `;
      
      // Errores más comunes
      const errorStatsQuery = `
        SELECT 
          error_message,
          COUNT(*) as count,
          notification_type,
          DATE(created_at) as last_occurrence
        FROM whatsapp_notifications 
        WHERE status = 'failed' 
          AND error_message IS NOT NULL
          AND created_at >= CURRENT_DATE - INTERVAL '${period} days'
        GROUP BY error_message, notification_type, DATE(created_at)
        ORDER BY count DESC, last_occurrence DESC
        LIMIT 10
      `;
      
      // Ejecutar todas las consultas
      const [generalStats, dailyStats, typeStats, topUsers, hourlyStats, errorStats] = await Promise.all([
        client.query(generalStatsQuery),
        client.query(dailyStatsQuery),
        client.query(typeStatsQuery),
        client.query(topUsersQuery),
        client.query(hourlyStatsQuery),
        client.query(errorStatsQuery)
      ]);
      
      // Calcular totales generales
      const totalsQuery = `
        SELECT 
          COUNT(*) as total_notifications,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as total_sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_failed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END) as total_skipped,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT ticket_id) as unique_tickets,
          MIN(created_at) as first_notification,
          MAX(created_at) as last_notification
        FROM whatsapp_notifications 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${period} days'
      `;
      
      const totalsResult = await client.query(totalsQuery);
      const totals = totalsResult.rows[0];
      
      // Calcular tasas
      const successRate = totals.total_notifications > 0 
        ? Math.round((totals.total_sent / totals.total_notifications) * 100 * 100) / 100 
        : 0;
      
      const failureRate = totals.total_notifications > 0 
        ? Math.round((totals.total_failed / totals.total_notifications) * 100 * 100) / 100 
        : 0;
      
      client.release();
      
      return {
        period: parseInt(period),
        summary: {
          total_notifications: parseInt(totals.total_notifications),
          total_sent: parseInt(totals.total_sent),
          total_failed: parseInt(totals.total_failed),
          total_skipped: parseInt(totals.total_skipped),
          unique_users: parseInt(totals.unique_users),
          unique_tickets: parseInt(totals.unique_tickets),
          success_rate: successRate,
          failure_rate: failureRate,
          first_notification: totals.first_notification,
          last_notification: totals.last_notification
        },
        general_stats: generalStats.rows,
        daily_stats: dailyStats.rows,
        type_stats: typeStats.rows,
        top_users: topUsers.rows,
        hourly_stats: hourlyStats.rows,
        error_stats: errorStats.rows
      };
      
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas detalladas WhatsApp:', error);
      return {
        period: parseInt(period),
        summary: {
          total_notifications: 0,
          total_sent: 0,
          total_failed: 0,
          total_skipped: 0,
          unique_users: 0,
          unique_tickets: 0,
          success_rate: 0,
          failure_rate: 0,
          first_notification: null,
          last_notification: null
        },
        general_stats: [],
        daily_stats: [],
        type_stats: [],
        top_users: [],
        hourly_stats: [],
        error_stats: []
      };
    }
  }

  /**
   * Generar reporte de rendimiento de WhatsApp
   */
  async generatePerformanceReport(period = '30') {
    try {
      const stats = await this.getDetailedStats(period);
      
      // Generar reporte textual
      const report = {
        title: `Reporte de Rendimiento WhatsApp - Últimos ${period} días`,
        generated_at: new Date().toISOString(),
        period_days: parseInt(period),
        
        executive_summary: {
          total_notifications: stats.summary.total_notifications,
          success_rate: `${stats.summary.success_rate}%`,
          failure_rate: `${stats.summary.failure_rate}%`,
          unique_users_reached: stats.summary.unique_users,
          tickets_with_notifications: stats.summary.unique_tickets
        },
        
        performance_analysis: {
          status: stats.summary.success_rate >= 90 ? 'Excelente' : 
                  stats.summary.success_rate >= 75 ? 'Bueno' : 
                  stats.summary.success_rate >= 50 ? 'Regular' : 'Deficiente',
          recommendations: this.generateRecommendations(stats),
          peak_hours: stats.hourly_stats
            .filter(h => h.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(h => `${h.hour}:00 (${h.count} notificaciones)`)
        },
        
        detailed_metrics: {
          notification_types: stats.type_stats.map(type => ({
            type: type.notification_type,
            total: type.total,
            success_rate: `${type.success_rate || 0}%`,
            status: type.success_rate >= 90 ? '✅ Excelente' : 
                    type.success_rate >= 75 ? '⚠️ Bueno' : 
                    type.success_rate >= 50 ? '⚠️ Regular' : '❌ Deficiente'
          })),
          
          top_errors: stats.error_stats.slice(0, 5).map(error => ({
            error: error.error_message,
            occurrences: error.count,
            type: error.notification_type,
            last_seen: error.last_occurrence
          })),
          
          daily_trend: this.calculateTrend(stats.daily_stats)
        },
        
        raw_data: stats
      };
      
      return report;
      
    } catch (error) {
      console.error('❌ Error generando reporte de rendimiento:', error);
      return {
        title: `Reporte de Rendimiento WhatsApp - Error`,
        generated_at: new Date().toISOString(),
        error: 'No se pudo generar el reporte',
        details: error.message
      };
    }
  }
  
  /**
   * Generar recomendaciones basadas en estadísticas
   */
  generateRecommendations(stats) {
    const recommendations = [];
    
    if (stats.summary.success_rate < 75) {
      recommendations.push('📉 Tasa de éxito baja. Revisar conexión y configuración de WhatsApp.');
    }
    
    if (stats.summary.failure_rate > 25) {
      recommendations.push('❌ Alta tasa de fallos. Verificar números de teléfono y conexión.');
    }
    
    const skippedRate = stats.summary.total_skipped / stats.summary.total_notifications * 100;
    if (skippedRate > 10) {
      recommendations.push('⏭️ Muchas notificaciones omitidas. Revisar configuración global.');
    }
    
    // Analizar errores más comunes
    const commonErrors = stats.error_stats.slice(0, 3);
    if (commonErrors.length > 0) {
      commonErrors.forEach(error => {
        if (error.error_message.includes('WhatsApp no está conectado')) {
          recommendations.push('🔌 Problemas de conexión frecuentes. Verificar estabilidad de la conexión.');
        }
        if (error.error_message.includes('número de teléfono')) {
          recommendations.push('📱 Números de teléfono inválidos. Actualizar información de usuarios.');
        }
      });
    }
    
    // Analizar patrones de horario
    const hourlyStats = stats.hourly_stats.filter(h => h.count > 0);
    if (hourlyStats.length > 0) {
      const peakHour = hourlyStats.reduce((max, h) => h.count > max.count ? h : max, hourlyStats[0]);
      recommendations.push(`⏰ Mayor actividad a las ${peakHour.hour}:00. Considerar optimizar en ese horario.`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Sistema funcionando correctamente. Mantener configuración actual.');
    }
    
    return recommendations;
  }
  
  /**
   * Calcular tendencia diaria
   */
  calculateTrend(dailyStats) {
    if (dailyStats.length < 2) return 'Sin datos suficientes';
    
    const sentData = dailyStats
      .filter(d => d.status === 'sent')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sentData.length < 2) return 'Sin datos suficientes';
    
    const firstWeek = sentData.slice(0, Math.min(7, sentData.length));
    const lastWeek = sentData.slice(-Math.min(7, sentData.length));
    
    const firstWeekAvg = firstWeek.reduce((sum, d) => sum + d.count, 0) / firstWeek.length;
    const lastWeekAvg = lastWeek.reduce((sum, d) => sum + d.count, 0) / lastWeek.length;
    
    const change = ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100;
    
    if (change > 10) return `📈 Creciente (+${change.toFixed(1)}%)`;
    if (change < -10) return `📉 Decreciente (${change.toFixed(1)}%)`;
    return `➡️ Estable (${change.toFixed(1)}%)`;
  }

  /**
   * Obtener horarios laborales desde la configuración del dashboard
   */
  async getBusinessHours() {
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT config_key, config_value 
        FROM dashboard_config 
        WHERE config_key IN (
          'work_hours_start', 
          'work_hours_end', 
          'work_hours_friday_end',
          'lunch_break_start',
          'lunch_break_end'
        )
      `);
      
      client.release();
      
      // Organizar los resultados
      const schedule = {};
      result.rows.forEach(row => {
        schedule[row.config_key] = row.config_value;
      });
      
      // Valores por defecto si no se encuentran en la BD
      return {
        work_hours_start: schedule.work_hours_start || '07:00',
        work_hours_end: schedule.work_hours_end || '17:30',
        work_hours_friday_end: schedule.work_hours_friday_end || '16:30',
        lunch_break_start: schedule.lunch_break_start || '12:00',
        lunch_break_end: schedule.lunch_break_end || '13:30'
      };
      
    } catch (error) {
      console.error('❌ Error obteniendo horarios laborales:', error);
      
      // Retornar horarios por defecto en caso de error
      return {
        work_hours_start: '07:00',
        work_hours_end: '17:30',
        work_hours_friday_end: '16:30',
        lunch_break_start: '12:00',
        lunch_break_end: '13:30'
      };
    }
  }

  /**
   * Verificar si estamos en horario laboral
   */
  async isBusinessHours() {
    try {
      const schedule = await this.getBusinessHours();
      const now = new Date();
      const currentDay = now.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      // No es día laboral (sábado = 6, domingo = 0)
      if (currentDay === 0 || currentDay === 6) {
        return false;
      }
      
      // Obtener horarios según el día
      const startTime = this.timeToMinutes(schedule.work_hours_start);
      let endTime;
      
      if (currentDay === 5) { // Viernes
        endTime = this.timeToMinutes(schedule.work_hours_friday_end);
      } else { // Lunes a Jueves
        endTime = this.timeToMinutes(schedule.work_hours_end);
      }
      
      // Verificar si está en horario de almuerzo
      const lunchStart = this.timeToMinutes(schedule.lunch_break_start);
      const lunchEnd = this.timeToMinutes(schedule.lunch_break_end);
      
      // Está en horario laboral pero no en almuerzo
      const inWorkHours = currentTime >= startTime && currentTime <= endTime;
      const inLunchBreak = currentTime >= lunchStart && currentTime <= lunchEnd;
      
      return inWorkHours && !inLunchBreak;
      
    } catch (error) {
      console.error('❌ Error verificando horario laboral:', error);
      return false; // Por seguridad, considerar como fuera de horario si hay error
    }
  }

  /**
   * Convertir tiempo en formato HH:MM a minutos desde medianoche
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
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
