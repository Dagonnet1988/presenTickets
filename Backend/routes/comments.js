import express from 'express';
import { pool, emitTicketNotification, getNotificationRecipients } from '../server.js';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from './notifications.js';

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

    const message = fields.message?.[0]?.trim() || '';
    const userId = parseInt(fields.userId?.[0], 10);

    // Permitir mensaje vacío si hay adjuntos
    const hasFiles = Object.keys(files).length > 0;
    if ((!message || message.length === 0) && !hasFiles) {
      return res.status(400).json({ message: 'Debe enviar un mensaje o al menos un archivo adjunto' });
    }
    if (isNaN(userId) || !ticketId || isNaN(parseInt(ticketId, 10))) {
      return res.status(400).json({ message: 'ticketId y userId válidos son obligatorios' });
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
        const uniqueFileName = `${sanitizedFileName}_${uuidv4()}${ext}`;
        const newPath = path.join(uploadDir, uniqueFileName);
        if (fs.existsSync(newPath)) {
          fs.unlinkSync(newPath);
        }
        try {
          fs.renameSync(file.filepath, newPath);
        } catch (error) {
          console.error('Error al renombrar el archivo:', error.message);
          throw new Error('No se pudo guardar el archivo');
        }
        return {
          name: file.originalFilename,
          url: `/uploads/${uniqueFileName}`
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
      const commentId = result.rows[0].id;

      for (const attachment of attachments) {
        await client.query(
          'INSERT INTO attachments (ticket_id, comment_id, filename, filepath) VALUES ($1, $2, $3, $4)',
          [ticketId, commentId, attachment.name, attachment.url]
        );
      }

      // Obtener roles y datos del ticket
      const ticketResult = await client.query('SELECT assigned_to, user_id, title FROM tickets WHERE id = $1', [ticketId]);
      const assignedTo = ticketResult.rows[0]?.assigned_to;
      const ticketUserId = ticketResult.rows[0]?.user_id;
      const ticketTitle = ticketResult.rows[0]?.title || '';
      const userResult = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
      const userRole = userResult.rows[0].role;
      // --- Lógica de notificaciones por comentario ---
      let recipients = [];
      let notificationType = null;
      if (userRole === 'admin') {
        if (assignedTo) recipients.push(assignedTo);
        if (ticketUserId) recipients.push(ticketUserId);
        notificationType = 'admin_comentario';
      } else if (userRole === 'tech') {
        if (ticketUserId) recipients.push(ticketUserId);
        notificationType = 'comentario_tech';
      } else if (userRole === 'user') {
        if (assignedTo) recipients.push(assignedTo);
        notificationType = 'comentario_user';
      }
      if (notificationType && recipients.length > 0) {
        emitTicketNotification(notificationType, {
          ticketId,
          commentId,
          userId,
          title: ticketTitle,
          createdAt: new Date()
        }, recipients);
        for (const uid of recipients) {
          await createNotification({
            user_id: uid,
            type: notificationType,
            message: `${ticketTitle} - Nuevo mensaje`,
            ticket_id: ticketId
          });
        }
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

// Obtener comentarios de un ticket (con adjuntos)
router.get('/:ticketId', async (req, res) => {
  const { ticketId } = req.params;
  if (!ticketId || isNaN(ticketId)) {
    return res.status(400).json({ message: 'ticketId válido es obligatorio' });
  }
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM comments WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]);
    const comments = result.rows;
    // Obtener adjuntos de todos los comentarios
    const commentIds = comments.map(c => c.id);
    let attachmentsByComment = {};
    if (commentIds.length > 0) {
      const attResult = await client.query('SELECT * FROM attachments WHERE comment_id = ANY($1)', [commentIds]);
      for (const att of attResult.rows) {
        if (!attachmentsByComment[att.comment_id]) attachmentsByComment[att.comment_id] = [];
        attachmentsByComment[att.comment_id].push(att);
      }
    }
    // Agregar los adjuntos a cada comentario
    for (const comment of comments) {
      comment.attachments = attachmentsByComment[comment.id] || [];
    }
    res.json(comments);
  } catch (err) {
    console.error('Error al obtener los comentarios:', err);
    res.status(500).json({ message: 'Error al obtener los comentarios' });
  } finally {
    client.release();
  }
});

export default router;
