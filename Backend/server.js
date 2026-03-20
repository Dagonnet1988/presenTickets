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

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mime from 'mime';
import helmet from 'helmet';
import { pool } from './db.js';
import { authMiddleware } from './routes/auth.js';
import whatsappService from './services/whatsappWebService.js';
import emailMonitorService from './services/emailMonitorService.js';
import checkAndCreateTables from './dbInit.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron from 'node-cron';
import { checkMaintenance } from './middleware/maintenanceMiddleware.js';

// Cargar variables de entorno según el entorno
// Solo cargar archivos .env si NO estamos en producción usando PM2
const ENV = process.env.NODE_ENV || 'development';

if (!process.env.pm_id) {
  // No estamos usando PM2, cargar desde archivos .env
  
  // Primero intentar cargar .env general (si existe)
  if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
    console.log('✅ Variables de entorno base cargadas desde .env');
  }

  // Luego cargar el archivo específico del entorno
  const envPath = `.env.${ENV}`;
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    console.log(`✅ Variables de entorno específicas cargadas desde ${envPath}`);
  } else if (!fs.existsSync('.env')) {
    console.warn(`⚠️ No se encontró archivo .env ni ${envPath}. Usando variables de entorno del sistema.`);
  }
} else {
  // Usando PM2, las variables base vienen del ecosystem.config
  // Pero también cargar .env.production para variables adicionales (como EMAIL_MONITOR)
  const envPath = `.env.${ENV}`;
  if (fs.existsSync(envPath)) {
    // Cargar sin sobrescribir las variables de PM2
    dotenv.config({ path: envPath });
    console.log(`✅ Ejecutando con PM2 en modo ${ENV} - Variables adicionales cargadas desde ${envPath}`);
  } else {
    console.log(`✅ Ejecutando con PM2 en modo ${ENV} - Variables de entorno cargadas desde ecosystem.config`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración básica de seguridad
app.use(helmet());

// Configuración de CORS
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
const allowedOrigins = [
  frontendUrl,
  'http://192.162.2.5',
  'http://192.162.2.5:80',
  'http://localhost:4200',
  'http://localhost:80',
  'http://localhost:4200', // Frontend Angular en desarrollo
  'http://127.0.0.1:4200', // Alternativa localhost
  'file://' // Para páginas de prueba locales
];

// Middleware básico de logging
app.use((req, res, next) => {
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origen (por ejemplo, desde aplicaciones móviles o Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origen está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error(`CORS: Origen ${origin} no permitido`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200 // Algunos navegadores legacy (IE11, varios SmartTVs) interpretan el estado 204 como error
}));

// Middleware para procesar JSON y datos de formularios (SOLO si NO es multipart/form-data)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
    // Si es multipart/form-data, saltar el parsing de Express y dejar que formidable lo maneje
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // Para todo lo demás, usar los parsers de Express
  express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // Solo procesar con urlencoded si NO es multipart/form-data
  if (!contentType.includes('multipart/form-data')) {
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
  } else {
    next();
  }
});


// Middleware específico para manejar errores de parsing
app.use((err, req, res, next) => {
  const localTime = new Date().toLocaleString('es-CO', { 
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    console.error(`❌ [${localTime}] Error de parsing:`, {
      type: err.type,
      message: err.message,
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type']
    });
    return res.status(400).json({ 
      error: 'Error al procesar la solicitud', 
      details: err.message 
    });
  }
  
  next(err);
});

// Configuración del directorio de subida
const uploadDir = path.join(path.resolve(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Servir archivos estáticos (subidas de archivos) con headers para permitir miniaturas cross-origin
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' http://localhost:4200 data:");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(uploadDir));

// Ruta para servir archivos adjuntos con control de descarga y nombre original
app.get('/uploads/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }

  const extension = path.extname(filename).toLowerCase();
  const visualizables = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'];

  let originalName = filename;
  try {
    const result = await pool.query('SELECT filename FROM attachments WHERE filepath = $1', [`/uploads/${filename}`]);
    if (result.rows[0]?.filename) {
      originalName = result.rows[0].filename;
    }
  } catch (e) {
    // Si falla la consulta, usa el nombre del archivo
  }

  const mimeType = mime.getType(filePath) || 'application/octet-stream';
  if (visualizables.includes(extension)) {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
    res.sendFile(filePath);
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.download(filePath, originalName, (err) => {
      if (err) {
        console.error('Error al forzar descarga:', err);
        res.status(500).json({ message: 'Error al descargar el archivo' });
      }
    });
  }
});

// Ruta específica para forzar descarga de archivos
app.get('/download/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }

  let originalName = filename;
  try {
    const result = await pool.query('SELECT filename FROM attachments WHERE filepath = $1', [`/uploads/${filename}`]);
    if (result.rows[0]?.filename) {
      originalName = result.rows[0].filename;
    }
  } catch (e) {
    // Si falla la consulta, usa el nombre del archivo
  }

  // Forzar siempre la descarga
  res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(filePath, originalName, (err) => {
    if (err) {
      console.error('Error al forzar descarga:', err);
      res.status(500).json({ message: 'Error al descargar el archivo' });
    }
  });
});

// Health check endpoint (debe estar antes de las rutas API)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    database: 'connected'
  });
});

// Función asíncrona para configurar las rutas después de las exports
async function setupRoutes() {
  // Importar las rutas dinámicamente
  const authRoutes = (await import('./routes/auth.js')).default;
  const ticketRoutes = (await import('./routes/tickets.js')).default;
  const userRoutes = (await import('./routes/users.js')).default;
  const commentRoutes = (await import('./routes/comments.js')).default;
  const notificationRoutes = (await import('./routes/notifications.js')).default;
  const analyticsRoutes = (await import('./routes/analytics.js')).default;
  const whatsappRoutes = (await import('./routes/whatsapp.js')).default;
  const dashboardSettingsRoutes = (await import('./routes/dashboardSettings.js')).default;
  const dashboardConfigRoutes = (await import('./routes/dashboardConfig.js')).default;
  const maintenanceSimpleRoutes = (await import('./routes/maintenanceSimple.js')).default;
  const emailMonitorRoutes = (await import('./routes/emailMonitor.js')).default;
  const surveysRoutes = (await import('./routes/surveys.js')).default;

  // Rutas públicas
  app.use('/api/auth', authRoutes);

  // Ruta pública para consultar el estado de mantenimiento
  app.get('/api/maintenance/status', async (req, res) => {
    try {
      const MaintenanceSimpleService = (await import('./services/maintenanceSimpleService.js')).default;
      const status = await MaintenanceSimpleService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error obteniendo estado de mantenimiento:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Rutas API protegidas with JWT y mantenimiento
  app.use('/api/tickets', authMiddleware, checkMaintenance, ticketRoutes);
  app.use('/api/users', authMiddleware, checkMaintenance, userRoutes);
  app.use('/api/comments', authMiddleware, checkMaintenance, commentRoutes);
  app.use('/api/notifications', authMiddleware, checkMaintenance, notificationRoutes);
  app.use('/api/analytics', authMiddleware, checkMaintenance, analyticsRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/dashboard', authMiddleware, checkMaintenance, dashboardSettingsRoutes);
  app.use('/api/dashboard-config', authMiddleware, checkMaintenance, dashboardConfigRoutes);

  // Rutas de mantenimiento (protegidas - requieren autenticación)
  app.use('/api/maintenance', authMiddleware, maintenanceSimpleRoutes);

  // Rutas de monitoreo de email (protegidas - requieren autenticación)
  app.use('/api/email-monitor', authMiddleware, emailMonitorRoutes);

  // Rutas de encuestas de satisfacción (protegidas)
  app.use('/api/surveys', authMiddleware, checkMaintenance, surveysRoutes);

  // Manejo de rutas no encontradas (debe estar al final)
  app.use((req, res, next) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
  });

  // Manejo de errores globales
  app.use((err, req, res, next) => {
    const localTime = new Date().toLocaleString('es-CO', { 
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.error(`❌ [${localTime}] ERROR GLOBAL:`, {
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body ? 'Presente' : 'Ausente'
    });
    
    // Si es un error CORS, no reiniciar el servidor
    if (err.message && err.message.includes('CORS')) {
      return res.status(403).json({ 
        error: 'Error de CORS', 
        message: err.message 
      });
    }
    
    // Para otros errores, enviar respuesta genérica
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        timestamp: localTime
      });
    }
  });
}

// --- SOCKET.IO para notificaciones en tiempo real ---
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  }
});

// Mapa para asociar userId a sockets
const userSockets = new Map();

io.on('connection', (socket) => {
  // Espera a que el frontend envíe su userId
  socket.on('register', (userId) => {
    if (!userId) return;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.data.userId = userId;
    // Unir a sala específica del usuario para usar io.to(`user-${userId}`)
    socket.join(`user-${userId}`);
  });
  
  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId && userSockets.has(userId)) {
      userSockets.get(userId).delete(socket.id);
      if (userSockets.get(userId).size === 0) userSockets.delete(userId);
    }
  });
});

// Exportar la instancia de io para usar en las rutas
export { io };

// Emitir notificación solo a destinatarios
export function emitTicketNotification(type, data, recipients = []) {
  recipients.forEach(userId => {
    const sockets = userSockets.get(String(userId));
    if (sockets) {
      sockets.forEach(socketId => {
        // Si data ya tiene message y data, desestructuramos, si no, lo adaptamos
        if (data && typeof data === 'object' && 'message' in data && 'data' in data) {
          io.to(socketId).emit('ticket-notification', { type, message: data.message, data: data.data });
        } else {
          io.to(socketId).emit('ticket-notification', { type, message: data.message || '', data });
        }
      });
    }
  });
}

// Devuelve un array de userIds a notificar (creador, asignado y participantes del ticket, excluyendo al actor)
export async function getNotificationRecipients(ticketId, actorId) {
  const client = await pool.connect();
  try {
    // Obtener creador, asignado y participantes del ticket
    const result = await client.query(`
      SELECT user_id, assigned_to, participants 
      FROM tickets 
      WHERE id = $1
    `, [ticketId]);
    
    if (result.rows.length === 0) {
      return [];
    }
    
    const ticket = result.rows[0];
    const recipients = new Set();
    
    // Agregar creador del ticket
    if (ticket.user_id && String(ticket.user_id) !== String(actorId)) {
      recipients.add(String(ticket.user_id));
    }
    
    // Agregar técnico asignado
    if (ticket.assigned_to && String(ticket.assigned_to) !== String(actorId)) {
      recipients.add(String(ticket.assigned_to));
    }
    
    // Agregar participantes adicionales
    if (ticket.participants && ticket.participants.length > 0) {
      ticket.participants.forEach(userId => {
        if (String(userId) !== String(actorId)) {
          recipients.add(String(userId));
        }
      });
    }
    
    return Array.from(recipients);
  } catch (err) {
    console.error('Error al obtener destinatarios de notificación:', err);
    return [];
  } finally {
    client.release();
  }
}

// Limpieza automática de notificaciones leídas cada noche a las 2am
cron.schedule('0 2 * * *', async () => {
  try {
    const result = await pool.query("DELETE FROM notifications WHERE is_read = true");
    console.log(`node-cron: Notificaciones leídas eliminadas: ${result.rowCount}`);
  } catch (err) {
    console.error('node-cron: Error al limpiar notificaciones leídas:', err);
  }
});

// Ejecutar la validación de tablas antes de iniciar el servidor
checkAndCreateTables().then(async () => {
  // Configurar las rutas primero (después de que las exports estén disponibles)
  await setupRoutes();
  console.log('✅ Rutas configuradas exitosamente');
  
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (WebSocket enabled) in ${ENV} mode`);
    
    // Configurar Socket.IO para WhatsApp
    whatsappService.setSocketIO(io);
    
    // Configurar Socket.IO para monitor de email
    emailMonitorService.setSocketIO(io);
    
    // Hacer io disponible para las rutas de mantenimiento
    app.set('io', io);
    
    // Auto-iniciar monitor de email si está configurado
    if (process.env.EMAIL_MONITOR_USER && process.env.EMAIL_MONITOR_PASSWORD) {
      setTimeout(async () => {
        console.log('📧 Iniciando monitor de email...');
        try {
          const result = await emailMonitorService.start();
          if (result.success) {
            console.log('📧 ✅', result.message);
          } else {
            console.error('📧 ❌', result.message);
          }
        } catch (err) {
          console.error('❌ Error al iniciar monitor de email:', err.message);
        }
      }, 5000);
    } else {
      console.log('📧 Monitor de email no configurado (faltan credenciales)');
    }
    
    // Inicializar servicio de WhatsApp después de que el servidor esté listo
    setTimeout(() => {
      console.log('🔄 Configurando servicio de WhatsApp desde servidor...');
      whatsappService.initialize().catch(err => {
        console.error('❌ Error al inicializar WhatsApp:', err);
      });
    }, 2000);
  });
});

// Manejo de errores no capturados para evitar crashes
process.on('uncaughtException', (err) => {
  const localTime = new Date().toLocaleString('es-CO', { 
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // Filtrar errores conocidos de WhatsApp/Puppeteer que NO son críticos
  const errorMsg = err.message || '';
  const isWhatsAppError = errorMsg.includes('WhatsApp') ||
                          errorMsg.includes('detached Frame') ||
                          errorMsg.includes('Target closed') ||
                          errorMsg.includes('Protocol error') ||
                          errorMsg.includes('Execution context') ||
                          errorMsg.includes('Puppeteer') ||
                          errorMsg.includes('markedUnread') ||
                          errorMsg.includes('sendSeen');
  
  if (isWhatsAppError) {
    console.warn(`⚠️ [${localTime}] Error de WhatsApp/Puppeteer (no crítico):`, errorMsg);
    return; // NO crashear el servidor
  }
  
  console.error(`💥 [${localTime}] EXCEPCIÓN NO CAPTURADA:`, {
    message: err.message,
    stack: err.stack,
    name: err.name
  });
  
  // Solo reiniciar si es un error crítico de base de datos o Express
  const isCriticalError = err.message?.includes('ECONNREFUSED') ||
                          err.message?.includes('listen EADDRINUSE') ||
                          err.code === 'EADDRINUSE';
  
  if (isCriticalError) {
    console.error(`⚠️ [${localTime}] Error crítico detectado. Reiniciando servidor...`);
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  } else {
    console.warn(`⚠️ [${localTime}] Error no crítico. El servidor continúa ejecutándose.`);
    // NO reiniciar el servidor por errores de WhatsApp/Puppeteer
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const localTime = new Date().toLocaleString('es-CO', { 
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // Filtrar errores conocidos de WhatsApp Web que no son críticos
  const reasonStr = reason?.message || reason?.toString() || '';
  
  if (reasonStr.includes('EBUSY') && reasonStr.includes('chrome_debug.log')) {
    // Error conocido de whatsapp-web.js en Windows al cerrar sesión
    console.warn(`⚠️ [${localTime}] Advertencia conocida de WhatsApp Web (Windows):`, reasonStr);
    console.log('ℹ️ Archivos de Chrome bloqueados temporalmente. Esto no afecta la funcionalidad.');
    return; // No registrar como error crítico
  }
  
  if (reasonStr.includes('EBUSY') || reasonStr.includes('resource busy')) {
    console.warn(`⚠️ [${localTime}] Recurso temporalmente bloqueado:`, reasonStr);
    return; // No registrar como error crítico
  }
  
  // Errores conocidos de WhatsApp Web - NO críticos
  if (reasonStr.includes('markedUnread') || reasonStr.includes('sendSeen')) {
    console.warn(`⚠️ [${localTime}] Error conocido de WhatsApp Web (markedUnread):`, reasonStr);
    console.log('ℹ️ Este error es causado por cambios en la API de WhatsApp. El mensaje puede haberse enviado.');
    return; // No registrar como error crítico
  }
  
  if (reasonStr.includes('Target closed') || reasonStr.includes('Protocol error')) {
    console.warn(`⚠️ [${localTime}] WhatsApp Web: Conexión cerrada inesperadamente`);
    console.log('ℹ️ Esto puede ocurrir si la sesión expiró o hay problemas de red.');
    return; // No registrar como error crítico
  }
  
  // Errores de Frame desconectado de Puppeteer - NO críticos
  if (reasonStr.includes('detached Frame') || reasonStr.includes('Execution context was destroyed')) {
    console.warn(`⚠️ [${localTime}] WhatsApp Web: Frame desconectado`);
    console.log('ℹ️ La sesión de WhatsApp perdió conexión. Se intentará reconectar automáticamente.');
    return; // No registrar como error crítico
  }
  
  // Para otros errores, registrarlos normalmente
  console.error(`🚫 [${localTime}] PROMESA RECHAZADA NO MANEJADA:`, {
    reason: reason,
    promise: promise
  });
});
