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
import pkg from 'pg';
import mime from 'mime';
import helmet from 'helmet';
import authRoutes, { authMiddleware } from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import userRoutes from './routes/users.js';
import commentRoutes from './routes/comments.js';
import notificationRoutes from './routes/notifications.js';
import pushRoutes from './routes/push.js';
import analyticsRoutes from './routes/analytics.js';
import checkAndCreateTables from './dbInit.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron from 'node-cron';

// Cargar variables de entorno según el entorno
const ENV = process.env.NODE_ENV || 'development';
const envPath = `.env.${ENV}`;

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✅ Variables de entorno cargadas desde ${envPath}`);
} else {
  console.warn(`⚠️ Archivo de configuración ${envPath} no encontrado. Usando variables de entorno predeterminadas.`);
}

const { Pool } = pkg;
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

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'presentickets',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error(`❌ Error al conectar a la base de datos (${ENV}):`, err.stack);
  } else {
    console.log(`✅ Conexión exitosa a la base de datos (${ENV})`);
    release();
  }
});

// Exportar pool para usarlo en otros módulos
export { pool };

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

// Rutas API protegidas with JWT
app.use('/api/tickets', authMiddleware, ticketRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/comments', authMiddleware, commentRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
// Rutas públicas
app.use('/api/auth', authRoutes);

// Manejo de rutas no encontradas
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

// Devuelve un array de userIds a notificar (técnico asignado y creador, excluyendo al actor)
export async function getNotificationRecipients(ticketId, actorId) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT user_id, assigned_to FROM tickets WHERE id = $1', [ticketId]);
    if (!result.rows.length) return [];
    const { user_id, assigned_to } = result.rows[0];
    const recipients = new Set();
    if (user_id && String(user_id) !== String(actorId)) recipients.add(String(user_id));
    if (assigned_to && String(assigned_to) !== String(actorId)) recipients.add(String(assigned_to));
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
checkAndCreateTables().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} (WebSocket enabled) in ${ENV} mode`);
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
  
  console.error(`💥 [${localTime}] EXCEPCIÓN NO CAPTURADA:`, {
    message: err.message,
    stack: err.stack,
    name: err.name
  });
  
  // No terminar el proceso inmediatamente, dar tiempo para log
  setTimeout(() => {
    console.error(`⚠️ [${localTime}] Reiniciando servidor debido a error crítico...`);
    process.exit(1);
  }, 1000);
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
  
  console.error(`🚫 [${localTime}] PROMESA RECHAZADA NO MANEJADA:`, {
    reason: reason,
    promise: promise
  });
});
