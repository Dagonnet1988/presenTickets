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

// Sistema de logging configurable por nivel
// Niveles: 'error' < 'warn' < 'info' < 'debug'
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

const logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => currentLogLevel >= LOG_LEVELS.info && console.log(...args),
  debug: (...args) => currentLogLevel >= LOG_LEVELS.debug && console.log(...args)
};

class WhatsAppWebService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.isDestroying = false; // Flag para controlar destrucción en curso
    this.qrCode = null;
    this.io = null; // Referencia a Socket.IO

    // Control de reconexión para evitar múltiples intentos simultáneos
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Aumentado para mayor resiliencia
    this.reconnectDelay = 10000; // 10 segundos entre intentos iniciales
    this.lastDisconnectTime = 0;
    this.healthCheckInterval = null; // Verificación periódica de conexión
    this.loadingCompleteTimeout = null; // Timeout cuando loading llega a 100% pero no hay ready
    this.initializationTimeout = null; // Timeout para detectar inicialización atascada
    this.initializationStartTime = 0;
    this.pendingQr = null; // QR almacenado temporalmente hasta que haya cliente Socket.IO
    this.socketListenerAdded = false;

    // Control de generación de QR
    this.qrGenerationCount = 0;
    this.maxQRGenerations = 3; // Máximo de QRs antes de detener (requiere reinicio manual)
    this.qrCooldownActive = false;
    this.stoppedAwaitingManualStart = false; // Bandera: detenido esperando inicio manual
    this.lastQRTime = 0;

    // Rate limiting para prevenir bloqueos de WhatsApp
    this.lastMessageTime = 0;
    this.messageCount = 0;
    this.dailyMessageCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.messageQueue = [];
    this.processingQueue = false;
    this.lastSendSkipLogAt = 0;

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
              logger.debug(`🧹 Limpiado archivo bloqueado: ${fileName}`);
            } catch (err) {
              // Ignorar errores - el archivo aún puede estar en uso
              if (err.code !== 'EBUSY' && err.code !== 'ENOENT') {
                logger.warn(`⚠️ No se pudo limpiar ${fileName}:`, err.message);
              }
            }
          }
        });
      }
    } catch (error) {
      // Error no crítico, solo advertir
      logger.warn('⚠️ Error en limpieza inicial de archivos:', error.message);
    }
  }

  /**
   * Inicializar servicio WhatsApp Web
   */
  async initialize() {
    try {
      // Verificar si hay destrucción en curso
      if (this.isDestroying) {
        logger.debug('⏳ Destrucción en curso, esperando antes de inicializar...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (this.isDestroying) {
          logger.debug('⚠️ Destrucción aún en curso, cancelando inicialización');
          return false;
        }
      }

      if (this.isInitializing) {
        logger.debug('⚠️ Inicialización ya en progreso...');
        return false;
      }

      if (this.isReady && this.client) {
        logger.debug('✅ WhatsApp Web ya está conectado');
        return true;
      }

      // Reset de banderas cuando se inicia manualmente
      // Esto permite reiniciar después de un stop por límite de QR
      if (this.stoppedAwaitingManualStart) {
        logger.debug('🔄 Reiniciando después de parada por límite de QR...');
        this.stoppedAwaitingManualStart = false;
        this.qrCooldownActive = false;
      }

      this.isInitializing = true;
      this.qrGenerationCount = 0; // Reset contador de QR
      logger.info('🚀 Inicializando WhatsApp Web...');

      // Cargar configuración de antibloqueo desde BD
      try {
        await this.loadAntiBlockConfigFromDB();
      } catch (dbError) {
        logger.warn('⚠️ Error cargando config desde BD, usando valores por defecto:', dbError.message);
      }

      // Sincronizar contadores con datos reales de la BD
      try {
        await this.syncCountersWithDB();
      } catch (syncError) {
        logger.warn('⚠️ Error sincronizando contadores, usando valores por defecto:', syncError.message);
      }

      // Inicializar cliente de WhatsApp Web
      await this.initializeClient();

      return true;
    } catch (error) {
      logger.error('❌ Error inicializando WhatsApp Web:', error.message);
      logger.error('Stack trace:', error.stack);
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
      // Destruir cliente anterior si existe de forma segura
      if (this.client) {
        logger.debug('🧹 Limpiando cliente anterior...');
        this.isDestroying = true;
        try {
          await Promise.race([
            this.client.destroy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout destruyendo cliente')), 10000))
          ]);
        } catch (destroyError) {
          logger.warn('⚠️ Error destruyendo cliente anterior:', destroyError.message);
        } finally {
          this.client = null;
          this.isDestroying = false;
        }
        // Esperar para que Chrome libere recursos
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Configuración robusta de Puppeteer para Windows
      // NOTA: NO usar --single-process ya que causa "Target closed" error
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--mute-audio',
        '--hide-scrollbars'
      ];

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.authFolder,
          clientId: 'presentickets-whatsapp' // ID único para evitar conflictos
        }),
        puppeteer: {
          headless: true,
          args: puppeteerArgs,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          timeout: 90000 // Timeout de 90 segundos para operaciones de Puppeteer
        },
        qrMaxRetries: 5, // Limitar reintentos de QR
        // takeoverOnConflict configurable vía variable de entorno para pruebas
        takeoverOnConflict: (process.env.WHATSAPP_TAKEOVER_ON_CONFLICT === 'true'),
        takeoverTimeoutMs: process.env.WHATSAPP_TAKEOVER_TIMEOUT_MS ? parseInt(process.env.WHATSAPP_TAKEOVER_TIMEOUT_MS, 10) : 0
      });

      logger.debug('ℹ️ whatsapp-web.js takeoverOnConflict=', (process.env.WHATSAPP_TAKEOVER_ON_CONFLICT === 'true'));

      // Configurar eventos ANTES de inicializar
      this.setupEventHandlers();

      // Inicializar cliente con timeout de seguridad
      logger.debug('🔄 Iniciando cliente WhatsApp Web...');
      const initPromise = this.client.initialize();
      
      // Timeout de 90 segundos para la inicialización
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout en inicialización de WhatsApp Web')), 90000);
      });

      await Promise.race([initPromise, timeoutPromise]);
      logger.info('✅ Cliente WhatsApp Web inicializado correctamente');

    } catch (error) {
      logger.error('❌ Error creando/iniciando cliente WhatsApp Web:', error.message || error);
      this.isInitializing = false;
      this.isDestroying = false;
      
      // Limpiar cliente en caso de error de forma segura
      if (this.client) {
        try {
          // Verificar que el cliente tenga el método destroy antes de llamarlo
          if (typeof this.client.destroy === 'function') {
            await Promise.race([
              this.client.destroy(),
              new Promise(resolve => setTimeout(resolve, 5000)) // Timeout de 5 segundos
            ]);
          }
        } catch (destroyError) {
          logger.warn('⚠️ Error limpiando cliente:', destroyError.message);
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
    // Evento QR Code - CON CONTROL DE RATE LIMITING
    this.client.on('qr', (qr) => {
      const now = Date.now();
      // Si el cliente ya está listo, no deberíamos emitir un nuevo QR
      if (this.isReady) {
        logger.warn('⚠️ Se generó un QR pero el cliente ya está marcado como ready. Ignorando QR.');
        // Aún actualizar qrCode interno para consistencia pero NO notificar al frontend
        this.qrCode = qr;
        return;
      }
      this.qrGenerationCount++;
      
      // Verificar si estamos generando QRs muy rápido (posible loop)
      if (this.lastQRTime && (now - this.lastQRTime) < 5000) {
        logger.warn(`⚠️ QR generado muy rápido (${Math.round((now - this.lastQRTime)/1000)}s desde el anterior)`);
      }
      
      // Limitar cantidad de QRs generados - DETENER COMPLETAMENTE después de 3 intentos
      if (this.qrGenerationCount > this.maxQRGenerations) {
        logger.error(`🛑 Se alcanzó el límite de ${this.maxQRGenerations} QRs sin escanear. Deteniendo servicio WhatsApp.`);
        logger.info('📋 Para reiniciar, usa el botón "Conectar" en el módulo de WhatsApp Admin.');
        
        // Marcar como detenido esperando inicio manual
        this.stoppedAwaitingManualStart = true;
        this.qrCooldownActive = true;
        
        // Notificar al frontend que requiere inicio manual
        if (this.io) {
          this.io.emit('whatsapp-connection-status', {
            isConnected: false,
            hasSocket: false,
            error: `No se escaneó el código QR después de ${this.maxQRGenerations} intentos. Haz clic en "Conectar" para reintentar.`,
            stoppedAwaitingManualStart: true,
            requiresManualRestart: true,
            timestamp: new Date().toISOString()
          });
        }
        
        // Detener el cliente completamente (sin reinicio automático)
        this.stopClientWithoutReconnect();
        
        return; // No procesar más QRs
      }
      
      this.lastQRTime = now;
      logger.debug(`📱 Código QR generado (#${this.qrGenerationCount}) - Enviando al frontend`);
      this.qrCode = qr;
      // Enviar QR a través de WebSocket si hay clientes conectados; si no, guardarlo para emitir cuando se conecte el admin
      const emitQrIfPossible = () => {
        if (!this.io) return false;
        // Detectar clientes conectados en distintas versiones de Socket.IO
        let clientsConnected = false;
        try {
          if (this.io.engine && typeof this.io.engine.clientsCount === 'number') {
            clientsConnected = this.io.engine.clientsCount > 0;
          } else if (this.io.sockets && this.io.sockets.sockets) {
            const s = this.io.sockets.sockets;
            clientsConnected = (typeof s.size === 'number') ? s.size > 0 : Object.keys(s).length > 0;
          }
        } catch (e) {
          logger.warn('⚠️ Error comprobando clientes Socket.IO:', e.message);
        }

        if (clientsConnected) {
          this.io.emit('whatsapp-qr-code', {
            qrCode: qr,
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
            attempt: this.qrGenerationCount,
            maxAttempts: this.maxQRGenerations
          });
          return true;
        }
        return false;
      };

      if (!emitQrIfPossible()) {
        // Guardar QR pendiente y registrar
        this.pendingQr = {
          qr,
          attempt: this.qrGenerationCount,
          maxAttempts: this.maxQRGenerations
        };
        logger.debug('📱 QR guardado en pending hasta que un cliente Socket.IO se conecte');
      }
    });

    // Evento Ready
    this.client.on('ready', () => {
      logger.info('✅ WhatsApp Web conectado exitosamente!');
      this.isReady = true;
      this.isInitializing = false;
      this.qrCode = null;
      this.pendingQr = null;
      this.qrGenerationCount = 0; // Reset contador de QR al conectar
      this.reconnectAttempts = 0; // Reset intentos de reconexión
      
      // Cancelar cualquier reconexión pendiente
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Cancelar timeout de inicialización
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }
      
      const initTime = Date.now() - this.initializationStartTime;
      logger.debug(`⏱️ Tiempo de inicialización: ${(initTime/1000).toFixed(1)}s`);
      
      // Limpiar cualquier timeout creado por loading_screen al llegar a 100%
      if (this.loadingCompleteTimeout) {
        clearTimeout(this.loadingCompleteTimeout);
        this.loadingCompleteTimeout = null;
      }
      // Informar al frontend que debe ocultar cualquier QR mostrado
      if (this.io) {
        this.io.emit('whatsapp-qr-code', { clear: true });
      }
      // Iniciar health check periódico
      this.startHealthCheck();

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
      // Solo loggear si es un mensaje de texto normal
      if (msg.body && msg.body.length < 100) {
        logger.debug('📨 Mensaje recibido:', msg.from);
      }
    });

    // Evento de desconexión - CON DEBOUNCE
    this.client.on('disconnected', (reason) => {
      const now = Date.now();
      logger.error('❌ WhatsApp Web desconectado:', reason);
      this.isReady = false;
      this.qrCode = null;
      this.isInitializing = false;

      // Notificar desconexión a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Desconectado: ' + reason,
          timestamp: new Date().toISOString()
        });
      }

      // Evitar múltiples reconexiones simultáneas con debounce
      if (this.reconnectTimeout) {
        logger.debug('⏳ Ya hay una reconexión programada, ignorando...');
        return;
      }

      // Verificar si la desconexión fue muy reciente (evitar loop)
      if (this.lastDisconnectTime && (now - this.lastDisconnectTime) < 5000) {
        logger.warn('⚠️ Desconexiones muy frecuentes detectadas, aumentando delay...');
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 120000); // Max 2 minutos
      }
      this.lastDisconnectTime = now;

      // Solo reconectar si no es una desconexión intencional (LOGOUT)
      const shouldReconnect = reason !== 'LOGOUT' && 
                              reason !== 'Client was logged out' &&
                              this.reconnectAttempts < this.maxReconnectAttempts;

      if (shouldReconnect) {
        this.reconnectAttempts++;
        logger.info(`🔄 Programando reconexión #${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${this.reconnectDelay/1000} segundos...`);
        
        this.reconnectTimeout = setTimeout(async () => {
          this.reconnectTimeout = null;
          logger.debug('🔄 Ejecutando reconexión automática...');
          
          try {
            await this.initialize();
          } catch (err) {
            logger.error('❌ Error en reconexión automática:', err.message);
          }
        }, this.reconnectDelay);
      } else if (reason === 'LOGOUT') {
        logger.info('🚪 Sesión cerrada (LOGOUT). Requiere escanear nuevo QR.');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 15000; // Reset delay
      } else {
        logger.warn(`⚠️ Máximo de reconexiones alcanzado (${this.maxReconnectAttempts}). Intervención manual requerida.`);
        if (this.io) {
          this.io.emit('whatsapp-connection-status', {
            isConnected: false,
            hasSocket: false,
            error: 'Máximo de reconexiones alcanzado. Por favor, reconecta manualmente.',
            requiresManualAction: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // Evento de autenticación fallida
    this.client.on('auth_failure', (msg) => {
      logger.error('❌ Fallo de autenticación:', msg);
      this.isReady = false;
      this.isInitializing = false;
      this.qrCode = null;
      
      // Notificar al frontend
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Fallo de autenticación: ' + msg,
          requiresNewQR: true,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Evento de autenticación exitosa
    this.client.on('authenticated', (session) => {
      logger.debug('🔐 Autenticado en WhatsApp Web (session recibida)');
      // En algunas versiones la sesión llega aquí antes de `ready`
      // Limpiar QR y notificar frontend para ocultar código si aún se muestra
      this.qrCode = null;
      this.pendingQr = null;
      if (this.loadingCompleteTimeout) {
        clearTimeout(this.loadingCompleteTimeout);
        this.loadingCompleteTimeout = null;
      }
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: true,
          info: { authenticated: true },
          timestamp: new Date().toISOString()
        });
        // Indicar explícitamente que frontend debe ocultar QR
        this.io.emit('whatsapp-qr-code', { clear: true });
      }
    });

    // Evento de carga
    this.client.on('loading_screen', (percent, message) => {
      logger.debug('⏳ Cargando WhatsApp Web:', percent + '%', message);
      // Notificar progreso al frontend
      if (this.io) {
        this.io.emit('whatsapp-loading', { percent, message });
      }

      // Si llega a 100% y no pasa a `ready` en X segundos, forzar reconexión
      try {
        if (percent === 100) {
          // Limpiar timeout anterior si existía
          if (this.loadingCompleteTimeout) {
            clearTimeout(this.loadingCompleteTimeout);
          }
          // Esperar 60s para que `ready` se dispare; si no, programar reconexión
          this.loadingCompleteTimeout = setTimeout(() => {
            if (!this.isReady) {
              logger.error('⚠️ Loading llegó a 100% pero `ready` no se disparó. Forzando reconexión.');
              if (this.io) {
                this.io.emit('whatsapp-connection-status', {
                  isConnected: false,
                  hasSocket: !!this.client,
                  error: 'Loading stuck at 100% - forcing reconnect',
                  timestamp: new Date().toISOString()
                });
              }
              // Forzar reconexión segura
              try {
                this.scheduleReconnect('Loading stuck at 100%');
              } catch (e) {
                logger.error('❌ Error al forzar reconexión tras loading stuck:', e.message);
              }
            }
          }, 60000); // 60s
        } else {
          // Si vuelve a baja % limpiar cualquier timeout pendiente
          if (this.loadingCompleteTimeout) {
            clearTimeout(this.loadingCompleteTimeout);
            this.loadingCompleteTimeout = null;
          }
        }
      } catch (e) {
        logger.warn('⚠️ Error manejando loading_screen:', e.message);
      }
    });

    // Evento de error crítico - IMPORTANTE para evitar crash del servidor
    this.client.on('error', (error) => {
      logger.error('❌ Error crítico en cliente WhatsApp Web:', error.message);
      
      // Detectar errores de desconexión
      const errorMsg = error.message || '';
      if (errorMsg.includes('detached Frame') || 
          errorMsg.includes('Target closed') ||
          errorMsg.includes('Protocol error')) {
        logger.error('❌ Detectado error de desconexión en evento error');
        this.isReady = false;
        this.scheduleReconnect('Error crítico: ' + errorMsg);
      }
      
      // Notificar a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: this.isReady,
          hasSocket: !!this.client,
          error: 'Error en cliente: ' + error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Detener el cliente SIN programar reconexión automática.
   * Se usa cuando se alcanza el límite de QRs sin escanear.
   * Requiere inicio manual desde el módulo de WhatsApp Admin.
   */
  async stopClientWithoutReconnect() {
    logger.info('🛑 Deteniendo cliente WhatsApp (sin reconexión automática)...');
    
    // Cancelar cualquier reconexión pendiente
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Detener health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Limpiar timeouts de inicialización
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }
    if (this.loadingCompleteTimeout) {
      clearTimeout(this.loadingCompleteTimeout);
      this.loadingCompleteTimeout = null;
    }
    
    // Destruir cliente si existe
    if (this.client) {
      try {
        this.isDestroying = true;
        await this.client.destroy();
        logger.debug('✅ Cliente WhatsApp destruido correctamente');
      } catch (err) {
        logger.warn('⚠️ Error al destruir cliente:', err.message);
      } finally {
        this.client = null;
        this.isDestroying = false;
      }
    }
    
    // Resetear estados
    this.isReady = false;
    this.isInitializing = false;
    this.qrCode = null;
    this.pendingQr = null;
    // NO resetear qrGenerationCount ni stoppedAwaitingManualStart aquí
    // Esos se resetean solo cuando el usuario inicia manualmente
    
    logger.info('📋 Servicio WhatsApp detenido. Esperando inicio manual desde el módulo Admin.');
  }

  /**
   * Programar reconexión con debounce
   */
  scheduleReconnect(reason) {
    // Si el cliente se detuvo esperando inicio manual, no intentar reconectar
    if (this.stoppedAwaitingManualStart) {
      logger.debug('🛑 Reconexión bloqueada: esperando inicio manual desde el panel admin.');
      return;
    }

    // Si ya hay una reconexión programada, no programar otra
    if (this.reconnectTimeout) {
      logger.debug('⏳ Ya hay una reconexión programada, ignorando...');
      return;
    }
    
    // Si ya está inicializando, no iniciar otra reconexión
    if (this.isInitializing) {
      logger.debug('⏳ Cliente ya está inicializando, ignorando reconexión...');
      return;
    }
    
    // Si han pasado más de 10 minutos desde el último intento, resetear contador
    const now = Date.now();
    if (now - this.lastDisconnectTime > 600000) { // 10 minutos
      logger.debug('🔄 Reseteando contador de reconexiones (pasaron >10 min)');
      this.reconnectAttempts = 0;
    }
    this.lastDisconnectTime = now;
    
    // Verificar máximo de intentos
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.info(`⚠️ Máximo de reconexiones alcanzado (${this.maxReconnectAttempts}). Esperando 5 minutos para reintentar...`);
      // En lugar de requerir intervención manual, esperar 5 minutos y resetear
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        logger.debug('🔄 Reiniciando ciclo de reconexión después de pausa...');
        this.scheduleReconnect('Reintento automático tras pausa');
      }, 300000); // 5 minutos
      
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          error: 'Reconexión pausada temporalmente. Reintentando en 5 minutos.',
          requiresManualAction: false,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 60000); // Max 1 minuto
    
    logger.info(`🔄 Programando reconexión #${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${delay/1000}s. Razón: ${reason}`);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      logger.debug('🔄 Ejecutando reconexión automática...');
      
      try {
        // Limpiar cliente anterior si existe
        if (this.client) {
          try {
            await this.client.destroy();
          } catch (e) {
            logger.warn('⚠️ Error destruyendo cliente anterior:', e.message);
          }
          this.client = null;
        }
        
        await this.initialize();
      } catch (err) {
        logger.error('❌ Error en reconexión automática:', err.message);
        // Si falla, programar otro intento
        this.scheduleReconnect('Fallo en reconexión anterior');
      }
    }, delay);
  }

  /**
   * Iniciar verificación periódica de salud de la conexión
   */
  startHealthCheck() {
    // Detener health check anterior si existe
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckCount = 0; // Contador para log periódico
    
    // Verificar cada 5 minutos que la conexión sigue activa
    this.healthCheckInterval = setInterval(async () => {
      this.healthCheckCount++;
      
      // Si está inicializando por más de 5 minutos, forzar reset
      if (this.isInitializing && !this.isReady) {
        const initTime = Date.now() - this.initializationStartTime;
        if (initTime > 300000) { // 5 minutos
          logger.error('🔍 Health check: Inicialización atascada por 5+ min. Forzando reset...');
          this.isInitializing = false;
          if (this.client) {
            try {
              await this.client.destroy();
            } catch (e) {
              logger.warn('Error destruyendo:', e.message);
            }
            this.client = null;
          }
          this.scheduleReconnect('Health check: inicialización atascada');
          return;
        }
      }
      
      if (!this.isReady || !this.client) {
        logger.debug('🔍 Health check: Cliente no está listo, intentando reconectar...');
        this.scheduleReconnect('Health check detectó cliente no listo');
        return;
      }
      
      try {
        // Intentar obtener estado del cliente
        const state = await this.client.getState();
        if (state !== 'CONNECTED') {
          logger.debug(`🔍 Health check: Estado inesperado (${state}), reconectando...`);
          this.isReady = false;
          this.scheduleReconnect(`Health check: estado ${state}`);
        } else {
          // Solo loggear cada 12 checks (1 hora) para no saturar logs
          if (this.healthCheckCount % 12 === 0) {
            logger.info(`✅ Health check OK - WhatsApp estable (${this.healthCheckCount} verificaciones)`);
          }
        }
      } catch (err) {
        logger.error('❌ Health check falló:', err.message);
        this.isReady = false;
        this.scheduleReconnect('Health check falló: ' + err.message);
      }
    }, 300000); // 5 minutos (era 2 minutos)
    
    logger.debug('🏥 Health check iniciado (cada 5 min, log cada 1 hora)');
  }
  
  /**
   * Detener health check
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug('🏥 Health check detenido');
    }
  }

  /**
   * Configurar Socket.IO
   */
  setSocketIO(io) {
    this.io = io;
    // Añadir listener de conexión una sola vez para enviar QR pendiente
    if (!this.socketListenerAdded && this.io) {
      this.socketListenerAdded = true;
      try {
        this.io.on('connection', (socket) => {
          // Si hay un QR pendiente, enviarlo inmediatamente
          if (this.pendingQr) {
            try {
              this.io.emit('whatsapp-qr-code', {
                qrCode: this.pendingQr.qr,
                qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(this.pendingQr.qr)}`,
                attempt: this.pendingQr.attempt,
                maxAttempts: this.pendingQr.maxAttempts
              });
              logger.debug('📱 QR pendiente emitido al cliente recién conectado');
            } catch (e) {
              logger.error('❌ Error enviando QR pendiente:', e.message);
            }
            this.pendingQr = null;
          }
          socket.on('disconnect', () => {
            // Conexión cerrada - no requiere log
          });
        });
      } catch (e) {
        logger.warn('⚠️ No se pudo registrar listener de Socket.IO:', e.message);
      }
    }
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

      // Enviar mensaje con retry y manejo de errores mejorado
      let result;
      let lastError;
      const maxRetries = 2;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Verificar que el cliente siga conectado antes de cada intento
          if (!this.isReady || !this.client) {
            throw new Error('WhatsApp se desconectó durante el envío');
          }
          
          // Enviar mensaje con opciones que evitan el error de sendSeen
          result = await this.client.sendMessage(formattedNumber, message, {
            // Evitar marcar como leído para prevenir el error 'markedUnread'
            sendSeen: false
          });
          
          // Si llegamos aquí, el mensaje se envió correctamente
          break;
          
        } catch (sendError) {
          lastError = sendError;
          const errorMsg = sendError.message || sendError.toString();
          
          // Si es el error conocido de markedUnread, intentar envío alternativo
          if (errorMsg.includes('markedUnread') || errorMsg.includes('sendSeen')) {
            logger.warn(`⚠️ Error conocido de WhatsApp Web (intento ${attempt}/${maxRetries}):`, errorMsg);
            
            if (attempt < maxRetries) {
              // Esperar un poco antes de reintentar
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
          }
          
          // Si es error de Target closed o detached Frame, el cliente se desconectó
          if (errorMsg.includes('Target closed') || 
              errorMsg.includes('Protocol error') ||
              errorMsg.includes('detached Frame') ||
              errorMsg.includes('Execution context was destroyed')) {
            logger.error('❌ Cliente WhatsApp desconectado durante envío (Frame detached)');
            this.isReady = false;
            this.qrCode = null;
            
            // Notificar desconexión a través de WebSocket
            if (this.io) {
              this.io.emit('whatsapp-connection-status', {
                isConnected: false,
                hasSocket: false,
                error: 'Sesión de WhatsApp perdida. Requiere reconexión.',
                requiresManualAction: true,
                timestamp: new Date().toISOString()
              });
            }
            
            // Programar reconexión automática si no hay una pendiente
            this.scheduleReconnect('Frame detached durante envío');
            
            throw new Error('WhatsApp Web se desconectó. Reconexión en progreso...');
          }
          
          // Si no es un error recuperable, lanzar inmediatamente
          if (attempt === maxRetries) {
            throw sendError;
          }
        }
      }
      
      if (!result && lastError) {
        throw lastError;
      }

      // Actualizar contadores
      this.updateMessageCounters();

      return result;
    } catch (error) {
      logger.error(`❌ Error enviando mensaje a ${phoneNumber}:`, error.message || error);
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
      logger.error('❌ Error cargando configuración de antibloqueo desde BD:', error);
    }
  }

  /**
   * Sincronizar contadores con base de datos real
   */
  async syncCountersWithDB() {
    try {
      if (!pool) {
        logger.warn('⚠️ Pool de BD no disponible para sincronizar contadores');
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
      logger.error('❌ Error sincronizando contadores con BD:', error);
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
      logger.warn(`⚠️ Límite diario de ${this.rateLimits.maxDailyMessages} mensajes alcanzado (actual: ${this.dailyMessageCount})`);
      return false;
    }

    // Verificar límite por hora
    if (this.messageCount >= this.rateLimits.maxMessagesPerHour) {
      logger.warn(`⚠️ Límite horario de ${this.rateLimits.maxMessagesPerHour} mensajes alcanzado (actual: ${this.messageCount})`);
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
      isInitializing: this.isInitializing,
      timestamp: new Date().toISOString(),
      currentQRCode: this.qrCode,
      // Estado de reconexión
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      qrGenerationCount: this.qrGenerationCount,
      maxQRGenerations: this.maxQRGenerations,
      qrCooldownActive: this.qrCooldownActive,
      // Indica si el servicio se detuvo por límite de QR y espera inicio manual
      stoppedAwaitingManualStart: this.stoppedAwaitingManualStart || false,
      // Estadísticas de uso
      dailyMessageCount: this.dailyMessageCount,
      lastMessageTime: this.lastMessageTime,
      lastMessageFormatted: this.lastMessageTime 
        ? new Date(this.lastMessageTime).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
        : 'Nunca',
      lastResetDate: this.lastResetDate,
      rateLimitStatus: {
        dailyLimit: this.rateLimits.maxDailyMessages,
        dailyUsed: this.dailyMessageCount,
        dailyRemaining: Math.max(0, this.rateLimits.maxDailyMessages - this.dailyMessageCount),
        hourlyLimit: this.rateLimits.maxMessagesPerHour,
        hourlyUsed: this.messageCount,
        hourlyRemaining: Math.max(0, this.rateLimits.maxMessagesPerHour - this.messageCount)
      }
    };
  }

  /**
   * Estado operativo para envios. Evita intentos cuando la sesion esta cerrada
   * o el cliente esta en recuperacion.
   */
  getSendAvailability() {
    if (this.stoppedAwaitingManualStart) {
      return {
        canSend: false,
        reason: 'Servicio detenido: se requiere inicio manual desde WhatsApp Admin.'
      };
    }

    if (this.isInitializing) {
      return {
        canSend: false,
        reason: 'WhatsApp Web esta inicializando. Intente nuevamente en unos segundos.'
      };
    }

    if (!this.isReady || !this.client) {
      return {
        canSend: false,
        reason: 'WhatsApp Web no esta conectado.'
      };
    }

    return {
      canSend: true,
      reason: null
    };
  }

  /**
   * Resetear estado interno (para recuperación manual)
   */
  resetState() {
    logger.debug('🔄 Reseteando estado interno de WhatsApp Service...');
    
    // Detener health check
    this.stopHealthCheck();
    
    // Cancelar reconexión pendiente
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Resetear flags
    this.isInitializing = false;
    this.isDestroying = false;
    this.isReady = false;
    this.qrCode = null;
    this.stoppedAwaitingManualStart = false;
    
    // Resetear contadores de control
    this.reconnectAttempts = 0;
    this.reconnectDelay = 15000;
    this.qrGenerationCount = 0;
    this.qrCooldownActive = false;
    this.lastDisconnectTime = 0;
    
    logger.debug('✅ Estado interno reseteado');
    return true;
  }

  /**
   * Desconectar WhatsApp Web
   */
  async disconnect() {
    try {
      logger.info('🔌 Desconectando WhatsApp Web...');
      
      // Detener health check
      this.stopHealthCheck();
      
      // Cancelar cualquier reconexión pendiente primero
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        logger.debug('⏹️ Reconexión pendiente cancelada');
      }
      
      this.isDestroying = true;

      if (this.client) {
        // Intentar hacer logout con manejo de errores específico para Windows
        try {
          await Promise.race([
            this.client.logout(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout en logout')), 10000))
          ]);
          logger.debug('✅ Logout exitoso');
        } catch (logoutError) {
          // Error EBUSY es común en Windows cuando Chrome tiene archivos bloqueados
          if (logoutError.message?.includes('EBUSY') || logoutError.message?.includes('resource busy')) {
            logger.warn('⚠️ Advertencia al cerrar sesión (archivos de Chrome bloqueados)');
          } else if (logoutError.message?.includes('Timeout')) {
            logger.warn('⚠️ Timeout durante logout, continuando con destrucción...');
          } else {
            logger.error('❌ Error durante logout:', logoutError.message);
          }
        }

        // Destruir el cliente de todas formas con timeout
        try {
          await Promise.race([
            this.client.destroy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout en destroy')), 10000))
          ]);
          logger.debug('✅ Cliente destruido');
        } catch (destroyError) {
          logger.warn('⚠️ Error al destruir cliente:', destroyError.message);
        }
        
        this.client = null;
      }

      this.isReady = false;
      this.qrCode = null;
      this.isInitializing = false;
      this.isDestroying = false;
      
      // Resetear contadores de control
      this.reconnectAttempts = 0;
      this.qrGenerationCount = 0;
      this.qrCooldownActive = false;

      // Limpiar archivos de sesión para forzar nueva autenticación
      // Esperar un momento para que Chrome libere los archivos
      if (process.platform === 'win32') {
        logger.debug('⏳ Esperando 3 segundos para que Chrome libere archivos (Windows)...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      try {
        const authPath = path.join(process.cwd(), 'whatsapp_auth_web');
        if (fs.existsSync(authPath)) {
          logger.debug('🧹 Limpiando archivos de sesión...');
          const files = fs.readdirSync(authPath);
          for (const file of files) {
            const filePath = path.join(authPath, file);
            try {
              if (fs.statSync(filePath).isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch (fileError) {
              // Ignorar errores EBUSY en Windows - los archivos se limpiarán en el próximo inicio
              if (fileError.code === 'EBUSY' && process.platform === 'win32') {
                logger.warn(`⚠️ Archivo ${file} está en uso, se limpiará en el próximo inicio`);
              } else {
                logger.warn(`⚠️ No se pudo eliminar ${file}:`, fileError.message);
              }
            }
          }
          logger.debug('✅ Archivos de sesión limpiados');
        }
      } catch (cleanupError) {
        logger.warn('⚠️ Error limpiando archivos de sesión:', cleanupError.message);
      }

      // Notificar desconexión a través de WebSocket
      if (this.io) {
        this.io.emit('whatsapp-connection-status', {
          isConnected: false,
          hasSocket: false,
          timestamp: new Date().toISOString()
        });
      }

      logger.info('✅ WhatsApp Web desconectado exitosamente');
    } catch (error) {
      logger.error('❌ Error durante desconexión:', error);
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
      logger.error('❌ Error durante reconexión:', error);
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
      logger.error('❌ Error obteniendo estadísticas de WhatsApp:', error);
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
      logger.error('❌ Error generando reporte de rendimiento:', error);
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
      // Guardia temprana: no intentar enviar si WhatsApp no esta operativo.
      const availability = this.getSendAvailability();
      if (!availability.canSend) {
        const now = Date.now();
        if (now - this.lastSendSkipLogAt > 60000) {
          logger.warn(`⚠️ Notificación WhatsApp omitida: ${availability.reason}`);
          this.lastSendSkipLogAt = now;
        }
        return false;
      }

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
        logger.debug(`⚠️ Notificaciones tipo "${notificationType}" deshabilitadas en configuración global`);
        await this.logWhatsAppNotification(userId, ticketId, message, 'skipped', `Notificaciones tipo "${notificationType}" deshabilitadas en configuración global`, null, notificationType);
        client.release();
        return false;
      }

      // Verificar horario laboral
      const inBusinessHours = await this.isBusinessHours();
      if (!inBusinessHours) {
        logger.debug(`⚠️ Notificación omitida: fuera de horario laboral`);
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
        logger.debug(`⚠️ Usuario ${fullName} sin número de teléfono`);
        client.release();
        return false;
      }

      // Obtener información adicional del ticket (si existe)
      let ticketSubject = 'Sin asunto';
      if (ticketId) {
        const ticketResult = await client.query(
          'SELECT title FROM tickets WHERE id = $1',
          [ticketId]
        );
        ticketSubject = ticketResult.rows.length > 0 ? ticketResult.rows[0].title : 'Sin asunto';
      }

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
      logger.error('❌ Error enviando notificación WhatsApp:', error.message || error);
      // Registrar error en base de datos (con try-catch adicional para evitar crash)
      try {
        await this.logWhatsAppNotification(userId, ticketId, message, 'failed', error.message || 'Error desconocido', null, notificationType);
      } catch (logError) {
        logger.error('❌ Error secundario al registrar en BD:', logError.message);
      }
      return false;
    }
  }

  /**
   * Formatear mensaje usando plantillas
   */
  async formatTicketMessageFromTemplate(userName, ticketId, ticketSubject, message, notificationType, client) {
    try {
      // Para external_email, el mensaje ya viene pre-formateado desde emailMonitorService
      // Solo agregamos el saludo y el wrapper
      if (notificationType === 'external_email') {
        const template = this.getRandomTemplate(notificationType);
        return template
          .replace(/{userName}/g, userName)
          .replace(/{comment}/g, message || 'Sin contenido');
      }

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
        .replace(/{ticketId}/g, ticketId || 'N/A')
        .replace(/{subject}/g, ticketSubject || 'Sin asunto')
        .replace(/{timestamp}/g, timestamp)
        .replace(/{comment}/g, message || 'Sin comentario')
        .replace(/{newStatus}/g, message || 'Sin estado');

      return formattedMessage;

    } catch (error) {
      logger.error('Error al formatear mensaje:', error);
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
      ],

      'external_email': [
        '📧 *Respuesta de Soporte Externo*\n─────────────────\n 📩 EMAIL RECIBIDO \n─────────────────\n\nHola {userName},\n\n{comment}\n\n─────────────────\n⚠️ *No responder a este mensaje*\nRevisa la bandeja del sistema.',
        '📩 *PresenTickets*\n════════════════\n📧 CORREO EXTERNO\n════════════════\n\n{userName}:\n\n{comment}\n\n─────────────────\n🚫 *Mensaje automático*\nNo responder. Revisa el sistema.',
        '📧 *Soporte Externo*\n━━━━━━━━━━━━━━━━\n 📩 CORREO RECIBIDO \n━━━━━━━━━━━━━━━━\n\nHola {userName},\n\n{comment}\n\n─────────────────\n⚠️ *Mensaje automático*\nRevisa la bandeja del sistema.'
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
      logger.error('❌ Error registrando notificación WhatsApp en BD:', dbError);
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
      logger.error('❌ Error verificando horario laboral:', error);
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
      logger.error('❌ Error obteniendo horarios laborales:', error);

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