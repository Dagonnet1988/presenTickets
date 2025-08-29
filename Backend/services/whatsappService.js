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
    
    // Configuración de límites de seguridad anti-detección
    this.rateLimits = {
      minDelayBetweenMessages: 3000, // 3 segundos mínimo entre mensajes
      maxDelayBetweenMessages: 8000, // 8 segundos máximo (simular comportamiento humano)
      maxMessagesPerHour: 20,        // Máximo 20 mensajes por hora (números nuevos)
      maxDailyMessages: 100,         // Máximo 100 mensajes por día
      maxBurstMessages: 3            // Máximo 3 mensajes seguidos, luego pausa larga
    };
    
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
      // Verificar si ya hay una sesión activa
      if (this.isConnected && this.socket) {
        console.log('⚠️ WhatsApp ya está conectado');
        return;
      }

      // Verificar si ya se está inicializando
      if (this.isInitializing) {
        console.log('⚠️ WhatsApp ya se está inicializando, esperando...');
        return;
      }

      console.log('🔄 Iniciando servicio WhatsApp...');
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
          this.isInitializing = false; // Limpiar la bandera cuando se desconecte
          
          if (shouldReconnect) {
            setTimeout(() => this.initialize(), 5000);
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp conectado exitosamente');
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
      
      console.log(`✅ Mensaje enviado a ${phoneNumber} (Total hoy: ${this.dailyMessageCount})`);
      return result;
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Verificar límites de rate limiting
   */
  async checkRateLimits() {
    const now = new Date();
    const today = now.toDateString();
    
    // Resetear contador diario si es un nuevo día
    if (this.lastResetDate !== today) {
      this.dailyMessageCount = 0;
      this.messageCount = 0;
      this.lastResetDate = today;
    }
    
    // Verificar límite diario
    if (this.dailyMessageCount >= this.rateLimits.maxDailyMessages) {
      console.warn(`⚠️ Límite diario de ${this.rateLimits.maxDailyMessages} mensajes alcanzado`);
      return false;
    }
    
    // Verificar límite por hora (últimos 60 minutos)
    const oneHourAgo = now.getTime() - (60 * 60 * 1000);
    if (this.lastMessageTime > oneHourAgo && this.messageCount >= this.rateLimits.maxMessagesPerHour) {
      console.warn(`⚠️ Límite horario de ${this.rateLimits.maxMessagesPerHour} mensajes alcanzado`);
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
      // Después de una ráfaga, pausa más larga (30-60 segundos)
      delay = Math.random() * 30000 + 30000;
      console.log(`⏸️ Pausa larga después de ráfaga: ${Math.round(delay/1000)}s`);
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
      console.log(`⏳ Esperando ${Math.round(delay/1000)}s antes del próximo mensaje...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Actualizar contadores de mensajes
   */
  updateMessageCounters() {
    const now = Date.now();
    this.lastMessageTime = now;
    this.messageCount++;
    this.dailyMessageCount++;
    
    // Resetear contador horario si pasó una hora
    const oneHourAgo = now - (60 * 60 * 1000);
    if (this.lastMessageTime < oneHourAgo) {
      this.messageCount = 1;
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
        console.log('⚠️ Notificaciones WhatsApp deshabilitadas globalmente');
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
        '🆕 *Clínica La Presentación*\n\nHola {userName},\n\nSe ha registrado el ticket #{ticketId}\n📋 {subject}\n\n⏰ {timestamp}',
        '📋 *PresenTickets*\n\n¡Hola {userName}!\n\nNuevo ticket creado: #{ticketId}\n📝 {subject}\n\n🕒 {timestamp}',
        '🎫 *Sistema de Tickets*\n\nHola {userName},\n\nTicket #{ticketId} creado exitosamente\n📄 {subject}\n\n📅 {timestamp}'
      ],
      
      'ticket_asignado': [
        '👤 *Asignación de Ticket*\n\nHola {userName},\n\nEl ticket #{ticketId}\n📋 {subject}\n\nTiene un técnico asignado\n\n🕒 {timestamp}',
        '🔔 *PresenTickets*\n\n{userName}, se asignó técnico al ticket:\n\n🎫 #{ticketId}\n📋 {subject}\n\n⏰ {timestamp}',
        '📌 *Ticket Asignado*\n\nHola {userName},\n\nTicket #{ticketId} asigando a un técnico\n📄 {subject}\n\n📅 {timestamp}'
      ],
      
      'cambio_estado': [
        '🔄 *Actualización de Ticket*\n\nHola {userName},\n\nTicket #{ticketId}: {newStatus}\n� {subject}\n\n⏰ {timestamp}',
        '📈 *Estado Actualizado*\n\n{userName}, su ticket cambió a: {newStatus}\n\n🎫 #{ticketId}\n📝 {subject}\n\n🕒 {timestamp}',
        '🔄 *PresenTickets*\n\nHola {userName},\n\nNuevo estado para #{ticketId}: {newStatus}\n📄 {subject}\n\n📅 {timestamp}'
      ],
      
      'comentario': [
        '💬 *Nuevo Comentario*\n\nHola {userName},\n\nComentario en ticket #{ticketId}:\n"{comment}"\n\n📋 {subject}\n⏰ {timestamp}',
        '� *PresenTickets*\n\n{userName}, nuevo comentario:\n\n💭 {comment}\n\n🎫 #{ticketId} - {subject}\n🕒 {timestamp}',
        '� *Comentario Agregado*\n\nHola {userName},\n\n"{comment}"\n\n📄 Ticket #{ticketId}: {subject}\n📅 {timestamp}'
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
   * Verificar estado de conexión con estadísticas de uso
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasSocket: !!this.socket,
      timestamp: new Date().toISOString(),
      currentQRCode: this.currentQRCode,
      // Estadísticas de uso para monitoreo
      dailyMessageCount: this.dailyMessageCount,
      lastMessageTime: this.lastMessageTime,
      rateLimitStatus: {
        dailyLimit: this.rateLimits.maxDailyMessages,
        dailyUsed: this.dailyMessageCount,
        dailyRemaining: this.rateLimits.maxDailyMessages - this.dailyMessageCount,
        hourlyLimit: this.rateLimits.maxMessagesPerHour,
        hourlyUsed: this.messageCount
      }
    };
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
