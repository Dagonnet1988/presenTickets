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
router.post('/:ticketId', async (req, res) => {
  const { ticketId } = req.params;
    try {
    // Configuración de formidable con límites y timeouts
    const form = formidable({ 
      multiples: true, 
      uploadDir: './uploads', 
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB máximo por archivo
      maxTotalFileSize: 100 * 1024 * 1024, // 100MB total
      maxFields: 1000,
      maxFieldsSize: 20 * 1024 * 1024, // 20MB para campos de texto
      allowEmptyFiles: false,
      minFileSize: 1, // Al menos 1 byte
      hashAlgorithm: false // Desactivar hash para mejor rendimiento
    });

    // Agregar timeout personalizado
    const timeout = setTimeout(() => {
      res.status(408).json({ message: 'Timeout al procesar el archivo. Intente con archivos más pequeños.' });
    }, 60000); // 60 segundos timeout

    form.parse(req, async (err, fields, files) => {
      clearTimeout(timeout); // Cancelar timeout si se completa a tiempo
        if (err) {
        // Enviar error específico basado en el tipo
        if (err.code === 'LIMIT_FILE_SIZE' || err.message.includes('maxFileSize')) {
          return res.status(413).json({ message: 'El archivo es demasiado grande. Máximo 50MB por archivo.' });
        } else if (err.code === 'LIMIT_FIELD_COUNT' || err.message.includes('maxFields')) {
          return res.status(413).json({ message: 'Demasiados campos en la solicitud.' });
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Archivo no esperado en la solicitud.' });
        } else {
          return res.status(400).json({ 
            message: 'Error al procesar la solicitud', 
            details: err.message 
          });
        }
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
    }    // Procesar archivos adjuntos con manejo de errores mejorado
    let attachments = [];
    try {      if (Object.keys(files).length > 0) {
        attachments = Object.values(files).flat().map((file, index) => {
          
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          if (!fs.existsSync(file.filepath)) {
            throw new Error(`Archivo temporal no encontrado: ${file.originalFilename}`);
          }
          
          // Validar tamaño del archivo
          if (file.size > 50 * 1024 * 1024) {
            throw new Error(`Archivo demasiado grande: ${file.originalFilename} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
          }
          
          const ext = path.extname(file.originalFilename || '');
          const baseName = path.basename(file.originalFilename || `file_${Date.now()}`, ext);
          const sanitizedFileName = sanitizeFileName(baseName);
          const uniqueFileName = `${sanitizedFileName}_${uuidv4()}${ext}`;
          const newPath = path.join(uploadDir, uniqueFileName);
          
          // Limpiar archivo existente si existe
          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
          }
            try {
            fs.renameSync(file.filepath, newPath);
          } catch (error) {
            throw new Error(`No se pudo guardar el archivo: ${file.originalFilename}`);
          }
          
          return {
            name: file.originalFilename,
            url: `/uploads/${uniqueFileName}`,
            size: file.size
          };
        });
      }    } catch (fileError) {
      return res.status(400).json({ 
        message: 'Error al procesar archivos adjuntos', 
        details: fileError.message 
      });
    }    const client = await pool.connect();
    try {
      // Guardar el comentario en la base de datos
      const result = await client.query(
        'INSERT INTO comments (ticket_id, user_id, comment, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [ticketId, userId, message, new Date()]
      );
      const commentId = result.rows[0].id;

      // Guardar archivos adjuntos
      for (const attachment of attachments) {
        await client.query(
          'INSERT INTO attachments (ticket_id, comment_id, filename, filepath) VALUES ($1, $2, $3, $4)',
          [ticketId, commentId, attachment.name, attachment.url]
        );
      }// Obtener roles y datos del ticket
      const ticketResult = await client.query('SELECT assigned_to, user_id, title, status FROM tickets WHERE id = $1', [ticketId]);
      const assignedTo = ticketResult.rows[0]?.assigned_to;
      const ticketUserId = ticketResult.rows[0]?.user_id;
      const ticketTitle = ticketResult.rows[0]?.title || '';
      const currentStatus = ticketResult.rows[0]?.status;
      const userResult = await client.query('SELECT role FROM users WHERE id = $1', [userId]);      const userRole = userResult.rows[0].role;
      
        // --- Lógica de notificaciones por comentario ---
      let recipients = [];
      let notificationType = null;
      if (userRole === 'admin') {
        if (assignedTo) recipients.push(assignedTo);
        if (ticketUserId) recipients.push(ticketUserId);
        notificationType = 'admin_comentario'
        } else if (userRole === 'tech') {
          if (ticketUserId) recipients.push(ticketUserId);
          notificationType = 'comentario_tech';
          await client.query(
            'UPDATE tickets SET status = $1 WHERE id = $2',
            ['Esperando respuesta del usuario', ticketId]
          );
        } else if (userRole === 'user') {
          if (currentStatus === 'Creado' || currentStatus === 'Esperando respuesta del usuario') {
            await client.query(
              'UPDATE tickets SET status = $1 WHERE id = $2',
              ['En gestión', ticketId]
            );
            recipients.push(assignedTo);
            notificationType = 'comentario_user';
            } else if (currentStatus === 'Escalado a externo' || currentStatus === 'Escalado a Tier 3 / Gerente de Cuenta') {
              recipients.push(assignedTo);
              notificationType = 'comentario_user';
            }
        } if (notificationType && recipients.length > 0) {
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
      res.status(201).json(result.rows[0]);    } catch (err) {
      // Limpiar archivos subidos en caso de error de base de datos
      for (const attachment of attachments) {
        try {
          const filePath = path.join(uploadDir, path.basename(attachment.url));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          // Error de limpieza no crítico
        }
      }
      
      res.status(500).json({ 
        message: 'Error al crear el comentario', 
        details: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
      });    } finally {
      client.release();
    }
  });
    } catch (globalError) {
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Error interno del servidor', 
        details: process.env.NODE_ENV === 'development' ? globalError.message : 'Error inesperado'
      });
    }
  }
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
