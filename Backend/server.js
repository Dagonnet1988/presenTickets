import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import pkg from 'pg';
import mime from 'mime';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import userRoutes from './routes/users.js';
import commentRoutes from './routes/comments.js';
import checkAndCreateTables from './dbInit.js';

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
app.use(helmet());

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

// Servir archivos estáticos (subidas de archivos)
app.use('/uploads', express.static(uploadDir));

// Ruta para servir archivos adjuntos
app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }

  const mimeType = mime.getType(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error al enviar el archivo:', err);
      res.status(500).json({ message: 'Error al enviar el archivo' });
    }
  });
});

// Rutas API
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/comments', commentRoutes);
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

// Ejecutar la validación de tablas antes de iniciar el servidor
checkAndCreateTables().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${ENV} mode`);
  });
});
