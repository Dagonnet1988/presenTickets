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

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';

class WhatsAppWebService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.qrCode = null;
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
      minDelayBetweenMessages: 1000, // Se cargará desde BD
      maxDelayBetweenMessages: 3000, // Se cargará desde BD
      maxMessagesPerHour: 60,        // Se cargará desde BD
      maxDailyMessages: 200,         // Se cargará desde BD
      maxBurstMessages: 5            // Se cargará desde BD
    };

    // Crear directorio de autenticación si no existe
    this.authFolder = path.join(process.cwd(), 'whatsapp_auth_web');
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }

    // Limpiar archivos de Chrome bloqueados en Windows al iniciar
    this.cleanupLockedFilesOnStartup();
  }

  /**
   * Limpiar archivos bloqueados de sesiones anteriores (específico para Windows)
   */
  cleanupLockedFilesOnStartup() {
    if (process.platform !== 'win32') return;

    try {
      const sessionPath = path.join(this.authFolder, 'session', 'Default');
      if (fs.existsSync(sessionPath)) {
        const filesToClean = [
          'chrome_debug.log',
          'Singleton Lock',
          'SingletonLock',
          'lockfile'
        ];

        filesToClean.forEach(fileName => {
          const filePath = path.join(sessionPath, fileName);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`🧹 Limpiado archivo bloqueado: ${fileName}`);
            } catch (err) {
              // Ignorar errores - el archivo aún puede estar en uso
              if (err.code !== 'EBUSY' && err.code !== 'ENOENT') {
                console.warn(`⚠️ No se pudo limpiar ${fileName}:`, err.message);
              }
            }
          }
        });
      }
    } catch (error) {
      // Error no crítico, solo advertir
      console.warn('⚠️ Error en limpieza inicial de archivos:', error.message);
    }
  }

  /**
   * Inicializar servicio WhatsApp Web
   */
  async initialize() {
    try {
      if (this.isInitializing) {
        console.log('⚠️ Inicialización ya en progreso...');
        return false;
      }

      if (this.isReady) {
        console.log('✅ WhatsApp Web ya está conectado');
        return true;
      }

      this.isInitializing = true;
      console.log('🚀 Inicializando WhatsApp Web...');

      // Cargar configuración de antibloqueo desde BD
      try {
        await this.loadAntiBlockConfigFromDB();
      } catch (dbError) {
        console.warn('⚠️ Error cargando config desde BD, usando valores por defecto:', dbError.message);
      }

      // Sincronizar contadores con datos reales de la BD
      try {
        await this.syncCountersWithDB();
      } catch (syncError) {
        console.warn('⚠️ Error sincronizando contadores, usando valores por defecto:', syncError.message);
      }

      // Inicializar cliente de WhatsApp Web
      await this.initializeClient();

      return true;
    } catch (error) {
      console.error('❌ Error inicializando WhatsApp Web:', error.message);
      console.error('Stack trace:', error.stack);
      this.isInitializing = false;
      this.isReady = false;
      
      // Enviar notificación de error a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Error al inicializar: ' + error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // NO lanzar el error - solo retornar false para evitar crash del servidor
      return false;
    }
  }

  /**
   * Inicializar cliente de WhatsApp Web
   */
  async initializeClient() {
    try {
      // Destruir cliente anterior si existe
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (destroyError) {
          console.warn('⚠️ Error destruyendo cliente anterior:', destroyError.message);
        }
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.authFolder
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false
        },
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
      });

      // Configurar eventos ANTES de inicializar
      this.setupEventHandlers();

      // Inicializar cliente con timeout de seguridad
      console.log('🔄 Iniciando cliente WhatsApp Web...');
      const initPromise = this.client.initialize();
      
      // Timeout de 60 segundos para la inicialización
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout en inicialización de WhatsApp Web')), 60000);
      });

      await Promise.race([initPromise, timeoutPromise]);
      console.log('✅ Cliente WhatsApp Web inicializado correctamente');

    } catch (error) {
      console.error('❌ Error creando/iniciando cliente WhatsApp Web:', error);
      this.isInitializing = false;
      
      // Limpiar cliente en caso de error
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (destroyError) {
          console.warn('⚠️ Error limpiando cliente:', destroyError.message);
        }
        this.client = null;
      }
      
      // Propagar el error para que initialize() lo capture
      throw error;
    }
  }

  /**
   * Configurar manejadores de eventos
   */
  setupEventHandlers() {
    // Evento QR Code
    this.client.on('qr', (qr) => {
      console.log('📱 Código QR generado - Enviando al frontend');
      this.qrCode = qr;

      // Enviar QR a través de WebSocket si está disponible
      if (this.io) {
        this.io.emit('whatsapp-qr-code', {
          qrCode: qr,
          qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`
        });
      }
    });

    // Evento Ready
    this.client.on('ready', () => {
      console.log('✅ WhatsApp Web conectado exitosamente!');
      this.isReady = true;
      this.isInitializing = false;
      this.qrCode = null;

      // Notificar conexión exitosa a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: true,
          hasSocket: true,
          timestamp: new Date().toISOString(),
          info: {
            user: this.client.info?.pushname || 'Usuario',
            phone: this.client.info?.wid?.user || 'N/A'
          }
        });
      }
    });

    // Evento de mensaje
    this.client.on('message', async (msg) => {
      // Procesar mensajes entrantes si es necesario
      console.log('📨 Mensaje recibido:', msg.from, msg.body);
    });

    // Evento de desconexión
    this.client.on('disconnected', (reason) => {
      console.log('❌ WhatsApp Web desconectado:', reason);
      this.isReady = false;
      this.qrCode = null;

      // Notificar desconexión a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Desconectado: ' + reason,
          timestamp: new Date().toISOString()
        });
      }

      // Solo reconectar si no es una desconexión intencional
      if (reason !== 'Client was logged out') {
        console.log('🔄 Intentando reconectar en 10 segundos...');
        setTimeout(() => {
          console.log('🔄 Reconectando WhatsApp Web...');
          // Usar .catch() para evitar errores no capturados que crasheen el servidor
          this.initialize().catch(err => {
            console.error('❌ Error en reconexión automática:', err);
            // No lanzar el error, solo registrarlo
          });
        }, 10000);
      } else {
        console.log('🚪 Sesión cerrada por el usuario. No reconectar automáticamente.');
      }
    });

    // Evento de autenticación fallida
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Fallo de autenticación:', msg);
      this.isReady = false;
      this.qrCode = null;
    });

    // Evento de carga
    this.client.on('loading_screen', (percent, message) => {
      console.log('⏳ Cargando WhatsApp Web:', percent + '%', message);
    });

    // Evento de error crítico - IMPORTANTE para evitar crash del servidor
    this.client.on('error', (error) => {
      console.error('❌ Error crítico en cliente WhatsApp Web:', error);
      // NO lanzar el error para evitar que crashee el servidor
      // Solo notificar a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Error en cliente: ' + error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Configurar Socket.IO
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Enviar mensaje de WhatsApp con rate limiting
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp Web no está conectado');
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
      const result = await this.client.sendMessage(formattedNumber, message);

      // Actualizar contadores
      this.updateMessageCounters();

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

    return formatted + '@c.us';
  }

  /**
   * Cargar configuración de antibloqueo desde la base de datos
   */
  async loadAntiBlockConfigFromDB() {
    try {
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

    // Reset diario si es necesario
    if (this.lastResetDate !== today) {
      this.lastResetDate = today;
      this.dailyMessageCount = 0;
      this.messageCount = 0;
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

    let delay = 0;

    if (this.messageCount > 0 && this.messageCount % this.rateLimits.maxBurstMessages === 0) {
      // Después de una ráfaga, pausa moderada (10-20 segundos)
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
    this.messageCount++;
    this.dailyMessageCount++;
  }

  /**
   * Obtener estado de conexión
   */
  getConnectionStatus() {
    return {
      isConnected: this.isReady,
      hasSocket: !!this.client,
      timestamp: new Date().toISOString(),
      currentQRCode: this.qrCode,
      // Estadísticas de uso
      dailyMessageCount: this.dailyMessageCount,
      lastMessageTime: this.lastMessageTime,
      lastResetDate: this.lastResetDate,
      rateLimitStatus: {
        dailyLimit: this.rateLimits.maxDailyMessages,
        dailyUsed: this.dailyMessageCount,
        dailyRemaining: this.rateLimits.maxDailyMessages - this.dailyMessageCount,
        hourlyLimit: this.rateLimits.maxMessagesPerHour,
        hourlyUsed: this.messageCount,
        hourlyRemaining: this.rateLimits.maxMessagesPerHour - this.messageCount
      }
    };
  }

  /**
   * Desconectar WhatsApp Web
   */
  async disconnect() {
    try {
      console.log('🔌 Desconectando WhatsApp Web...');

      if (this.client) {
        // Intentar hacer logout con manejo de errores específico para Windows
        try {
          await this.client.logout();
          console.log('✅ Logout exitoso');
        } catch (logoutError) {
          // Error EBUSY es común en Windows cuando Chrome tiene archivos bloqueados
          if (logoutError.message?.includes('EBUSY') || logoutError.message?.includes('resource busy')) {
            console.warn('⚠️ Advertencia al cerrar sesión (archivos de Chrome bloqueados):', logoutError.message);
            console.log('ℹ️ Esto es normal en Windows. La sesión se cerrará de todas formas.');
          } else {
            console.error('❌ Error durante logout:', logoutError);
          }
        }

        // Destruir el cliente de todas formas
        try {
          await this.client.destroy();
          console.log('✅ Cliente destruido');
        } catch (destroyError) {
          console.warn('⚠️ Error al destruir cliente:', destroyError.message);
        }
        
        this.client = null;
      }

      this.isReady = false;
      this.qrCode = null;
      this.isInitializing = false;

      // Limpiar archivos de sesión para forzar nueva autenticación
      // Esperar un momento para que Chrome libere los archivos
      if (process.platform === 'win32') {
        console.log('⏳ Esperando 2 segundos para que Chrome libere archivos (Windows)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const authPath = path.join(process.cwd(), 'whatsapp_auth_web');
        if (fs.existsSync(authPath)) {
          console.log('🧹 Limpiando archivos de sesión...');
          const files = fs.readdirSync(authPath);
          for (const file of files) {
            const filePath = path.join(authPath, file);
            try {
              if (fs.statSync(filePath).isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch (fileError) {
              // Ignorar errores EBUSY en Windows - los archivos se limpiarán en el próximo inicio
              if (fileError.code === 'EBUSY' && process.platform === 'win32') {
                console.warn(`⚠️ Archivo ${file} está en uso, se limpiará en el próximo inicio`);
              } else {
                console.warn(`⚠️ No se pudo eliminar ${file}:`, fileError.message);
              }
            }
          }
          console.log('✅ Archivos de sesión limpiados');
        }
      } catch (cleanupError) {
        console.warn('⚠️ Error limpiando archivos de sesión:', cleanupError.message);
      }

      // Notificar desconexión a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          timestamp: new Date().toISOString()
        });
      }

      console.log('✅ WhatsApp Web desconectado exitosamente');
    } catch (error) {
      console.error('❌ Error durante desconexión:', error);
    }
  }

  /**
   * Reconectar WhatsApp Web
   */
  async reconnect() {
    try {
      await this.disconnect();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.initialize();
    } catch (error) {
      console.error('❌ Error durante reconexión:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de WhatsApp
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
   * Obtener estadísticas de notificaciones (alias para getWhatsAppStats)
   */
  async getNotificationStats(period = '7') {
    // Para compatibilidad, devolver estadísticas simples
    return this.getWhatsAppStats();
  }

  /**
   * Generar reporte de rendimiento
   */
  async generatePerformanceReport(period = '30') {
    try {
      const stats = await this.getWhatsAppStats();

      // Generar reporte básico
      const report = {
        title: `Reporte de Rendimiento WhatsApp - Últimos ${period} días`,
        generated_at: new Date().toISOString(),
        period_days: parseInt(period),

        executive_summary: {
          total_notifications: stats.today?.total || 0,
          success_rate: stats.today?.total > 0 ? Math.round((stats.today.sent / stats.today.total) * 100) + '%' : '0%',
          failure_rate: 'N/A',
          unique_users_reached: 'N/A',
          tickets_with_notifications: 'N/A'
        },

        performance_analysis: {
          status: 'Operativo',
          recommendations: [
            'Sistema funcionando correctamente',
            'Monitoreo continuo recomendado'
          ],
          peak_hours: []
        },

        detailed_metrics: {
          daily_trend: 'N/A',
          notification_types: [],
          top_errors: []
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
   * Obtener límites de rate limiting actuales
   */
  getRateLimits() {
    return this.rateLimits;
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
   * Formatear mensaje usando plantillas
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
   * Obtener plantilla aleatoria
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

    // Selección verdaderamente aleatoria
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
   * Convertir tiempo en formato HH:MM a minutos desde medianoche
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

// Instancia singleton
const whatsappWebService = new WhatsAppWebService();

export default whatsappWebService;