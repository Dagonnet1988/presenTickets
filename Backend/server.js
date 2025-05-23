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

// Configuración de seguridad
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "http://localhost:4200"],
        scriptSrc: ["'self'", "'unsafe-inline'", "http://localhost:4200"],
        styleSrc: ["'self'", "'unsafe-inline'", "http://localhost:4200"],
        imgSrc: ["'self'", "data:", "http://localhost:4200"],
        connectSrc: ["'self'", "ws://localhost:3000", "http://localhost:4200"],
        fontSrc: ["'self'", "http://localhost:4200"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  })
);

// Configuración de CORS
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

// Middleware para procesar JSON y datos de formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Rutas API protegidas with JWT
app.use('/api/tickets', authMiddleware, ticketRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/comments', authMiddleware, commentRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
// Rutas públicas
app.use('/api/auth', authRoutes);

// Manejo de rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo de errores globales
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ message: 'Error interno del servidor' });
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
