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

// Obtener todos los tickets
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener los tickets:', err);
    res.status(500).json({ message: 'Error al obtener los tickets' });
  } finally {
    client.release();
  }
});

// Obtener un ticket por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const ticketResult = await client.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket no encontrado' });
    }

    const ticket = ticketResult.rows[0];
    const attachmentsResult = await client.query('SELECT * FROM attachments WHERE ticket_id = $1', [id]);
    ticket.attachments = attachmentsResult.rows;

    res.json(ticket);
  } catch (err) {
    console.error('Error al obtener el ticket:', err);
    res.status(500).json({ message: 'Error al obtener el ticket' });
  } finally {
    client.release();
  }
});

// Crear un nuevo ticket
router.post('/', (req, res) => {
  const form = formidable({ multiples: true, uploadDir: './uploads', keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error al procesar los archivos:', err);
      return res.status(400).json({ message: 'Error al procesar los archivos' });
    }

    const title = fields.title[0];
    const description = fields.description[0];
    const category = fields.category[0];
    const area = fields.area[0];
    const status = fields.status[0];
    const userId = fields.userId[0];

    if (!title || !description || !category || !area || !status || !userId) {
      return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

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

    const ticketData = {
      title,
      description,
      category,
      area,
      status,
      userId,
      attachments
    };

    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO tickets (title, description, category, area, status, user_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [ticketData.title, ticketData.description, ticketData.category, ticketData.area, ticketData.status, ticketData.userId, new Date()]
      );

      const ticketId = result.rows[0].id;

      for (const attachment of attachments) {
        await client.query(
          'INSERT INTO attachments (ticket_id, filename, filepath) VALUES ($1, $2, $3)',
          [ticketId, attachment.name, attachment.url] // Usar el nombre único y la URL basada en él
        );
      }

      res.status(201).json({ ticketId, ...ticketData });
    } catch (err) {
      console.error('Error al guardar el ticket en la base de datos:', err);
      res.status(500).json({ message: 'Error al guardar el ticket en la base de datos' });
    } finally {
      client.release();
    }
  });
});

// Actualizar un ticket
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { priority, assigned_to, status } = req.body;

  // Validar que el ID sea un número entero
  if (isNaN(parseInt(id, 10))) {
    return res.status(400).json({ message: 'ID de ticket no válido' });
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (priority) {
    updates.push(`priority = $${index}`);
    values.push(priority);
    index++;
  }

  if (status) {
    updates.push(`status = $${index}`);
    values.push(status);
    index++;
  }

  if (assigned_to) {
    updates.push(`assigned_to = $${index}`);
    values.push(parseInt(assigned_to, 10));
    index++;
  }

  // Verificar si el estado es 'Cerrado' o 'Resuelto' y actualizar el campo 'closed_at'
  if (status === 'Cerrado' || status === 'Resuelto') {
    updates.push(`closed_at = $${index}`);
    values.push(new Date());
    index++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
  }

  const query = `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${index}`;
  values.push(parseInt(id, 10));

  const client = await pool.connect();
  try {
    await client.query(query, values);
    res.status(200).json({ message: 'Ticket actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar el ticket:', err);
    res.status(500).json({ message: 'Error al actualizar el ticket' });
  } finally {
    client.release();
  }
});

// Nueva ruta para servir archivos adjuntos con los encabezados correctos
router.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    } else if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.txt') {
      contentType = 'text/plain';
    } else if (ext === '.zip') {
      contentType = 'application/zip';
    } else if (ext === '.rar') {
      contentType = 'application/x-rar-compressed';
    } else if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.xls') {
      contentType = 'application/vnd.ms-excel';
    } else if (ext === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.doc' || ext === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
  });
});

export default router;