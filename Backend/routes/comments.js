import express from 'express';
import { pool } from '../server.js';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const uploadDir = path.join(path.resolve(), 'uploads');

// Lista de extensiones de archivos prohibidas
const prohibitedExtensions = ['.exe', '.msi', '.bat', '.cmd', '.sh', '.js', '.com', '.scr', '.pif', '.cpl', '.msc'];

// Función para validar y sanitizar el nombre del archivo
function sanitizeFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (prohibitedExtensions.includes(ext)) {
    throw new Error('Extensión de archivo no permitida');
  }
  return fileName.replace(/[^a-z0-9\.\-_]/gi, '_');
}

// Crear un nuevo comentario
router.post('/:ticketId', (req, res) => {
  const { ticketId } = req.params;

  const form = formidable({ multiples: true, uploadDir: './uploads', keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error al procesar la solicitud:', err);
      return res.status(400).json({ message: 'Error al procesar la solicitud' });
    }

    const message = fields.message[0]?.trim(); // Limpia espacios y toma el primer valor como cadena
    const userId = parseInt(fields.userId[0], 10); // Convierte a número

    // Validar datos de entrada
    if (!message || isNaN(userId) || !ticketId || isNaN(parseInt(ticketId, 10))) {
      return res.status(400).json({ message: 'Comentario, ticketId y userId válidos son obligatorios' });
    }

    // Procesar archivos adjuntos
    const attachments = Object.values(files).flat().map(file => {
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
    
          if (fs.existsSync(file.filepath)) {
            const ext = path.extname(file.originalFilename || '');
            const baseName = path.basename(file.originalFilename || `file_${Date.now()}`, ext);
            const sanitizedFileName = sanitizeFileName(baseName);
            const uniqueFileName = `${sanitizedFileName}_${uuidv4()}${ext}`; // Generar un nombre único
    
            const newPath = path.join(uploadDir, uniqueFileName);
    
            if (fs.existsSync(newPath)) {
              fs.unlinkSync(newPath); // Eliminar el archivo existente si ya existe
            }
    
            try {
              fs.renameSync(file.filepath, newPath);
            } catch (error) {
              console.error('Error al renombrar el archivo:', error.message);
              throw new Error('No se pudo guardar el archivo');
            }
    
            return {
              name: file.originalFilename, // Guardar el nombre único
              url: `/uploads/${uniqueFileName}` // Guardar la URL basada en el nombre único
            };
          } else {
            throw new Error('El archivo no se cargó correctamente');
          }
        });

    const client = await pool.connect();
    try {
      // Guardar el comentario en la base de datos
      const result = await client.query(
        'INSERT INTO comments (ticket_id, user_id, comment, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [ticketId, userId, message, new Date()]
      );

      for (const attachment of attachments) {
        await client.query(
          'INSERT INTO attachments (ticket_id, filename, filepath) VALUES ($1, $2, $3)',
          [ticketId, attachment.name, attachment.url]
        );
      }

      // Actualizar el estado del ticket según el rol del usuario
      const statusResult = await client.query('SELECT status FROM tickets WHERE id = $1', [ticketId]);
      const userResult = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
      const userRole = userResult.rows[0].role;
      if(statusResult.rows[0].status === 'En gestión' && userRole === 'tech' || 
        statusResult.rows[0].status === 'Creado' && userRole === 'tech' ||
        statusResult.rows[0].status === 'Escalado a externo' && userRole === 'tech') {
        let newStatus = 'Esperando respuesta del usuario';
        await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [newStatus, ticketId]);
      }else if(statusResult.rows[0].status === 'Esperando respuesta del usuario' && userRole === 'user') {
        let newStatus = 'En gestión';
        await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [newStatus, ticketId]);
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error al crear el comentario:', err);
      res.status(500).json({ message: 'Error al crear el comentario' });
    } finally {
      client.release();
    }
  });
});

// Obtener comentarios de un ticket
router.get('/:ticketId', async (req, res) => {
  const { ticketId } = req.params;

  // Validar datos de entrada
  if (!ticketId || isNaN(ticketId)) {
    return res.status(400).json({ message: 'ticketId válido es obligatorio' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM comments WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener los comentarios:', err);
    res.status(500).json({ message: 'Error al obtener los comentarios' });
  } finally {
    client.release();
  }
});

export default router;
