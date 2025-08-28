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

import express from "express";
import { pool, emitTicketNotification, io } from "../server.js";
import formidable from "formidable";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { createNotification } from "./notifications.js";

const router = express.Router();
const uploadDir = path.join(path.resolve(), "uploads");

// Lista de extensiones de archivos prohibidas
const prohibitedExtensions = [
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".sh",
  ".js",
  ".com",
  ".scr",
  ".pif",
  ".cpl",
  ".msc",
];

// Función para validar y sanitizar el nombre del archivo
function sanitizeFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (prohibitedExtensions.includes(ext)) {
    throw new Error("Extensión de archivo no permitida");
  }
  return fileName.replace(/[^a-z0-9\.\-_]/gi, "_");
}

// Obtener todos los tickets (filtrados por acceso del usuario)
router.get("/", async (req, res) => {
  const client = await pool.connect();
  const userId = req.user.id;
  const userRole = req.user.role;
  
  // Debug log for troubleshooting
  // console.log('[TICKETS] Get all tickets for user:', userId, 'role:', userRole);
  
  try {
    let query;
    let params;
    
    // Admin y tech pueden ver todos los tickets
    if (userRole === 'admin' || userRole === 'tech') {
      query = "SELECT * FROM tickets ORDER BY created_at DESC";
      params = [];
    } else {
      // Usuarios normales solo ven tickets donde son creador, asignado o participante
      query = `
        SELECT * FROM tickets 
        WHERE user_id = $1 OR assigned_to = $1 OR (participants IS NOT NULL AND $1 = ANY(participants))
        ORDER BY created_at DESC
      `;
      params = [userId];
    }
    
    const result = await client.query(query, params);
    
    // Asegurar que participants siempre sea un array válido
    const ticketsWithValidParticipants = result.rows.map(ticket => ({
      ...ticket,
      participants: ticket.participants || []
    }));
    
    // Debug logs for troubleshooting
    // console.log('[TICKETS] Returning', ticketsWithValidParticipants.length, 'tickets');
    // console.log('[TICKETS] Sample ticket participants:', ticketsWithValidParticipants[0]?.participants);
    
    res.json(ticketsWithValidParticipants);
  } catch (err) {
    console.error("Error al obtener los tickets:", err);
    res.status(500).json({ message: "Error al obtener los tickets" });
  } finally {
    client.release();
  }
});

// Obtener un ticket por ID (con control de acceso)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  const client = await pool.connect();
  
  // Debug log for troubleshooting
  // console.log('[TICKET] Getting ticket', id, 'for user:', userId, 'role:', userRole);
  
  try {
    // Obtener el ticket
    const ticketResult = await client.query(
      "SELECT * FROM tickets WHERE id = $1",
      [id]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    const ticket = ticketResult.rows[0];
    
    // Verificar acceso (admin/tech pueden ver todos, usuarios solo los suyos)
    if (userRole !== 'admin' && userRole !== 'tech') {
      const userIdNum = parseInt(userId);
      const isCreator = ticket.user_id == userIdNum;
      const isAssigned = ticket.assigned_to == userIdNum;
      const isParticipant = ticket.participants && ticket.participants.includes(userIdNum);
      const hasAccess = isCreator || isAssigned || isParticipant;
      
      // Debug log for troubleshooting access issues
      // console.log('[TICKET] Access check for user', userIdNum, ':', {
      //   isCreator, isAssigned, isParticipant, hasAccess,
      //   ticketUserId: ticket.user_id,
      //   ticketAssignedTo: ticket.assigned_to,
      //   ticketParticipants: ticket.participants
      // });
      
      if (!hasAccess) {
        return res.status(403).json({ message: "No tienes acceso a este ticket" });
      }
    }

    // Obtener adjuntos
    const attachmentsResult = await client.query(
      "SELECT * FROM attachments WHERE ticket_id = $1",
      [id]
    );
    ticket.attachments = attachmentsResult.rows;

    // Asegurar que participants siempre sea un array válido
    ticket.participants = ticket.participants || [];

    res.json(ticket);
  } catch (err) {
    console.error("Error al obtener el ticket:", err);
    res.status(500).json({ message: "Error al obtener el ticket" });
  } finally {
    client.release();
  }
});

// Crear un nuevo ticket
router.post("/", (req, res) => {
  const form = formidable({
    multiples: true,
    uploadDir: "./uploads",
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error al procesar los archivos:", err);
      return res
        .status(400)
        .json({ message: "Error al procesar los archivos" });
    }

    const title = fields.title[0];
    const description = fields.description[0];
    const category = fields.category[0];
    const area = fields.area[0];
    const status = fields.status[0];
    const userId = fields.userId[0];

    if (!title || !description || !category || !area || !status || !userId) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    const attachments = Object.values(files)
      .flat()
      .map((file) => {
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        if (fs.existsSync(file.filepath)) {
          const ext = path.extname(file.originalFilename || "");
          const baseName = path.basename(
            file.originalFilename || `file_${Date.now()}`,
            ext
          );
          const sanitizedFileName = sanitizeFileName(baseName);
          const uniqueFileName = `${sanitizedFileName}_${uuidv4()}${ext}`; // Generar un nombre único

          const newPath = path.join(uploadDir, uniqueFileName);

          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath); // Eliminar el archivo existente si ya existe
          }

          try {
            fs.renameSync(file.filepath, newPath);
          } catch (error) {
            console.error("Error al renombrar el archivo:", error.message);
            throw new Error("No se pudo guardar el archivo");
          }

          return {
            name: file.originalFilename, // Guardar el nombre único
            url: `/uploads/${uniqueFileName}`, // Guardar la URL basada en el nombre único
          };
        } else {
          throw new Error("El archivo no se cargó correctamente");
        }
      });

    const ticketData = {
      title,
      description,
      category,
      area,
      status,
      userId,
      attachments,
    };

    const client = await pool.connect();
    try {
      const result = await client.query(
        "INSERT INTO tickets (title, description, category, area, status, user_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [
          ticketData.title,
          ticketData.description,
          ticketData.category,
          ticketData.area,
          ticketData.status,
          ticketData.userId,
          new Date(),
        ]
      );

      const ticketId = result.rows[0].id;

      for (const attachment of attachments) {
        await client.query(
          "INSERT INTO attachments (ticket_id, filename, filepath) VALUES ($1, $2, $3)",
          [ticketId, attachment.name, attachment.url] // Usar el nombre único y la URL basada en él
        );
      }

      // Notificar a todos los técnicos sobre el nuevo ticket
      try {
        // Obtener todos los usuarios con rol de técnico
        const techsResult = await client.query(
          "SELECT id FROM users WHERE role = $1",
          ["tech"]
        );
        const techIds = techsResult.rows.map((tech) => tech.id);

        if (techIds.length > 0) {
          // Enviar notificación a todos los técnicos
          for (const techId of techIds) {
            await createNotification({
              user_id: techId,
              type: "nuevo_ticket",
              message: `Nuevo ticket: ${ticketData.title}`,
              ticket_id: ticketId,
            });
          }

          // Emitir notificación en tiempo real
          emitTicketNotification(
            "nuevo_ticket",
            {
              ticketId,
              title: ticketData.title,
              createdAt: new Date(),
              message: `Nuevo ticket creado: ${ticketData.title}`,
            },
            techIds
          );
        }
      } catch (notifyErr) {
        console.error(
          "Error al enviar notificaciones de nuevo ticket:",
          notifyErr
        );
        // No fallamos la operación principal si las notificaciones fallan
      }

      res.status(201).json({ ticketId, ...ticketData });
    } catch (err) {
      console.error("Error al guardar el ticket en la base de datos:", err);
      res
        .status(500)
        .json({ message: "Error al guardar el ticket en la base de datos" });
    } finally {
      client.release();
    }
  });
});

// Actualizar un ticket
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { priority, assigned_to, status, name, external_ticket_id, actorRole } = req.body;

  // Validar que el ID sea un número entero
  if (isNaN(parseInt(id, 10))) {
    return res.status(400).json({ message: "ID de ticket no válido" });
  }
  const updates = [];
  const values = [];
  let index = 1;
  let prevStatus = null;

  // Si hay cambio de estado, obtener el estado anterior PRIMERO
  if (status) {
    const prevStatusResult = await pool.query(
      "SELECT status FROM tickets WHERE id = $1",
      [id]
    );
    prevStatus = prevStatusResult.rows[0]?.status;
  }

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
    
    // Si se está asignando un técnico y no se especificó un estado, 
    // cambiar automáticamente a "En revisión"
    if (!status) {
      // Verificar que el ticket no esté ya cerrado
      const currentStatusResult = await pool.query(
        "SELECT status FROM tickets WHERE id = $1",
        [id]
      );
      const currentStatus = currentStatusResult.rows[0]?.status;
      
      if (currentStatus && currentStatus !== 'Cerrado' && currentStatus !== 'Resuelto') {
        updates.push(`status = $${index}`);
        values.push('En revisión');
        index++;
      }
    }
  }

  // Agregar soporte para actualizar el título/nombre del ticket
  if (name) {
    updates.push(`title = $${index}`);
    values.push(name);
    index++;
  }

  // Agregar soporte para actualizar el ID de ticket externo
  if (external_ticket_id !== undefined) {
    updates.push(`external_ticket_id = $${index}`);
    values.push(external_ticket_id || null); // Permitir valores null o vacíos
    index++;
  }

  // Verificar si el estado es 'Cerrado' o 'Resuelto' y actualizar el campo 'closed_at'
  if (status === "Cerrado" || status === "Resuelto") {
    updates.push(`closed_at = $${index}`);
    values.push(new Date());
    index++;
  }
  // Si cambia de cualquier estado cerrado a otro estado (especialmente "Esperando respuesta del usuario"), es una reapertura
  // En ese caso, establecer closed_at a NULL
  else if (status && (prevStatus === "Cerrado" || prevStatus === "Resuelto")) {
    updates.push(`closed_at = NULL`);
  }

  if (updates.length === 0) {
    return res
      .status(400)
      .json({ message: "No se proporcionaron campos para actualizar" });
  }

  const query = `UPDATE tickets SET ${updates.join(", ")} WHERE id = $${index}`;
  values.push(parseInt(id, 10));
  const client = await pool.connect();
  try {
    await client.query(query, values);

    // Emitir evento de actualización de ticket a todos los usuarios conectados
    const updatedFields = {};
    if (priority) updatedFields.priority = priority;
    if (status) updatedFields.status = status;
    if (assigned_to) updatedFields.assigned_to = assigned_to;
    if (name) updatedFields.title = name;
    if (external_ticket_id !== undefined) updatedFields.external_ticket_id = external_ticket_id;
    
    io.emit('ticket-updated', {
      ticketId: parseInt(id),
      updatedFields: updatedFields
    });

    // Si hay cambio de ID externo, obtener datos para las notificaciones
    if (external_ticket_id !== undefined) {
      try {
        const ticketDataQuery = `
          SELECT 
            t.id, t.title, t.priority, t.status, t.external_ticket_id,
            t.user_id
          FROM tickets t 
          WHERE t.id = $1
        `;
        
        const ticketResult = await client.query(ticketDataQuery, [id]);
        
        if (ticketResult.rows.length > 0) {
          const ticketData = ticketResult.rows[0];
          
          // Obtener usuarios que deben ser notificados
          const usersQuery = `
            SELECT DISTINCT u.id 
            FROM users u 
            WHERE 
              u.id = $1 OR  -- Creador del ticket
              u.role = 'admin'  -- Administradores
          `;
          
          const usersResult = await client.query(usersQuery, [ticketData.user_id]);
          
          // Definir el mensaje una vez
          const mensaje = `ID Externo actualizado en ticket "${ticketData.title}"`;
          
          // Guardar notificación en la base de datos
          for (const user of usersResult.rows) {
            const insertNotificationQuery = `
              INSERT INTO notifications (user_id, ticket_id, type, message, created_at)
              VALUES ($1, $2, $3, $4, NOW())
            `;
            
            await client.query(insertNotificationQuery, [
              user.id,
              id,
              'id_externo_actualizado',
              mensaje
            ]);
          }
          
          // Emitir evento de socket para actualizaciones en tiempo real
          // Obtener los IDs de los usuarios que deben recibir la notificación
          const userIds = usersResult.rows.map(user => user.id);
          
          emitTicketNotification(
            'id_externo_actualizado',
            {
              ticketId: parseInt(id),
              title: ticketData.title,
              createdAt: new Date(),
              message: mensaje,
              external_ticket_id: external_ticket_id
            },
            userIds
          );
          
          // Emitir evento específico para actualización de ticket a todos los usuarios conectados
          io.emit('ticket-updated', {
            ticketId: parseInt(id),
            updatedFields: { external_ticket_id: external_ticket_id },
            ticketData: ticketData
          });
        }
      } catch (notificationError) {
        console.error('Error enviando notificaciones para ID externo:', notificationError);
        // No fallar la actualización principal por error en notificaciones
      }
    }

    // Si hay cambio de estado, obtener datos necesarios para las notificaciones
    if (status) {
      
      try {
        // Obtener detalles del ticket y destinatarios para notificaciones
        const ticketResult = await client.query(
          "SELECT title, user_id, assigned_to FROM tickets WHERE id = $1",
          [id]
        );
        if (ticketResult.rows.length > 0) {
          const { title, user_id, assigned_to } = ticketResult.rows[0];
          const ticketTitle = title || "Ticket sin título";

          // Determinar el tipo de notificación según el estado
          let notificationType = "cambio_estado";
          let notificationMessage = `${ticketTitle}: estado cambiado a ${status}`;

          // Determinar los destinatarios según el estado
          let recipients = [];// Si es "Escalado a externo" o "Escalado a Tier3" o "Resuelto" - notificar al usuario
          if (
            status === "Escalado a externo" ||
            status === "Escalado a Tier 3 / Gerente de Cuenta" ||
            status === "Resuelto"
          ) {
            
            if (user_id) {
              recipients.push(user_id);

              // Crear notificación en la base de datos
              await createNotification({
                user_id: user_id,
                type: notificationType,
                message: notificationMessage,
                ticket_id: id,
              });

              // Emitir notificación en tiempo real
              emitTicketNotification(
                notificationType,
                {
                  ticketId: id,
                  title: ticketTitle,
                  createdAt: new Date(),
                  message: notificationMessage,
                },
                [user_id]
              );
            }
          }
          // Si es "En revisión" - notificar al técnico asignado
          else if (status === "En revisión") {
            if (assigned_to) {
              recipients.push(assigned_to);

              // Crear notificación en la base de datos
              await createNotification({
                user_id: assigned_to,
                type: notificationType,
                message: notificationMessage,
                ticket_id: id,
              });

              // Emitir notificación en tiempo real
              emitTicketNotification(
                notificationType,
                {
                  ticketId: id,
                  title: ticketTitle,
                  createdAt: new Date(),
                  message: notificationMessage,
                },
                [assigned_to]
              );
            }
          }
          // Si es "En proceso" - notificar al técnico asignado
          else if (status === "En proceso") {
            if (assigned_to) {
              recipients.push(assigned_to);

              // Crear notificación en la base de datos
              await createNotification({
                user_id: assigned_to,
                type: notificationType,
                message: notificationMessage,
                ticket_id: id,
              });

              // Emitir notificación en tiempo real
              emitTicketNotification(
                notificationType,
                {
                  ticketId: id,
                  title: ticketTitle,
                  createdAt: new Date(),
                  message: notificationMessage,
                },
                [assigned_to]
              );
            }
          }
          // Si es "Cerrado" - notificar al técnico
          else if (status === "Cerrado") {
            if (assigned_to) {
              recipients.push(assigned_to);

              // Crear notificación en la base de datos
              await createNotification({
                user_id: assigned_to,
                type: notificationType,
                message: notificationMessage,
                ticket_id: id,
              });

              // Emitir notificación en tiempo real
              emitTicketNotification(
                notificationType,
                {
                  ticketId: id,
                  title: ticketTitle,
                  createdAt: new Date(),
                  message: notificationMessage,
                },
                [assigned_to]
              );
            }
          }
          // Si es "Esperando respuesta del usuario" - verificar si es una reapertura
          else if (status === "Esperando respuesta del usuario") {
            // Si hay un técnico asignado y el ticket estaba cerrado o resuelto, es una reapertura
            if (assigned_to && (prevStatus === "Resuelto" || prevStatus === "Cerrado")) {
              // Determinar quién está reabriendo el ticket basado en el rol del usuario autenticado
              const currentUserRole = req.user?.role; // Obtener el rol del usuario autenticado
              
              notificationType = "ticket_reabierto";
              
              // Determinar el destinatario y mensaje según quién reabre el ticket
              let recipientId = null;
              
              if (currentUserRole === "user") {
                // Usuario reabre el ticket -> notificar al técnico asignado
                recipientId = assigned_to;
                notificationMessage = `${ticketTitle}: ha sido reabierto por el usuario`;
              } else if (currentUserRole === "tech" || currentUserRole === "admin") {
                // Técnico/Admin reabre el ticket -> notificar al usuario creador
                recipientId = user_id;
                notificationMessage = `${ticketTitle}: ha sido reabierto por soporte técnico`;
              }
              
              // Solo crear notificación si hay un destinatario válido
              if (recipientId) {
                // Crear notificación en la base de datos
                await createNotification({
                  user_id: recipientId,
                  type: notificationType,
                  message: notificationMessage,
                  ticket_id: id,
                });

                // Emitir notificación en tiempo real
                emitTicketNotification(
                  notificationType,
                  {
                    ticketId: id,
                    title: ticketTitle,
                    createdAt: new Date(),
                    message: notificationMessage,
                  },
                  [recipientId]
                );
              }
            }
          } else {
            // Estado que no requiere notificación específica
          }
        } else {
          // No se encontró el ticket para enviar notificaciones
        }
      } catch (notifyErr) {
        console.error(
          "Error al enviar notificaciones de cambio de estado:",
          notifyErr
        );
        // No fallamos la operación principal si las notificaciones fallan
      }
    }

    // Enviar notificación al usuario cuando se asigna un ticket
    if (assigned_to) {
      try {
        // Obtener detalles del ticket
        const ticketResult = await client.query(
          "SELECT title, user_id FROM tickets WHERE id = $1",
          [id]
        );
        const ticketTitle = ticketResult.rows[0]?.title || "Ticket sin título";
        const userId = ticketResult.rows[0]?.user_id || null;

        // Crear notificación en la base de datos
        await createNotification({
          user_id: userId,
          type: "ticket_asignado",
          message: `Ticket ${ticketTitle} asignado`,
          ticket_id: id,
        });

        // Enviar notificación en tiempo real
        emitTicketNotification(
          "ticket_asignado",
          {
            ticketId: id,
            title: ticketTitle,
            createdAt: new Date(),
            message: `Ticket ${ticketTitle} asignado a técnico`,
          },
          [userId]
        );
      } catch (notifyErr) {
        console.error("Error al enviar notificación de asignación:", notifyErr);
      }
    }

    res.status(200).json({ message: "Ticket actualizado correctamente" });
  } catch (err) {
    console.error("Error al actualizar el ticket:", err);
    res.status(500).json({ message: "Error al actualizar el ticket" });
  } finally {
    client.release();
  }
});

// Nueva ruta para servir archivos adjuntos con los encabezados correctos
router.get("/uploads/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") {
      contentType = "image/jpeg";
    } else if (ext === ".png") {
      contentType = "image/png";
    } else if (ext === ".gif") {
      contentType = "image/gif";
    } else if (ext === ".pdf") {
      contentType = "application/pdf";
    } else if (ext === ".txt") {
      contentType = "text/plain";
    } else if (ext === ".zip") {
      contentType = "application/zip";
    } else if (ext === ".rar") {
      contentType = "application/x-rar-compressed";
    } else if (ext === ".csv") {
      contentType = "text/csv";
    } else if (ext === ".xls") {
      contentType = "application/vnd.ms-excel";
    } else if (ext === ".xlsx") {
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (ext === ".doc" || ext === ".docx") {
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    res.setHeader("Content-Type", contentType);
    res.sendFile(filePath);
  });
});

// ============= RUTAS DE PARTICIPANTES =============

// Middleware para verificar que el usuario puede ver el ticket
async function canViewTicket(req, res, next) {
  try {
    const ticketId = req.params.ticketId || req.body.ticketId;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Admin y tech pueden ver todos los tickets
    if (userRole === 'admin' || userRole === 'tech') {
      return next();
    }
    
    const client = await pool.connect();
    try {
      // Para usuarios normales, verificar si es creador, asignado o participante
      const accessCheck = await client.query(`
        SELECT 1 FROM tickets t
        WHERE t.id = $1 AND (
          t.user_id = $2 OR 
          t.assigned_to = $2 OR 
          (t.participants IS NOT NULL AND $2 = ANY(t.participants))
        )
      `, [ticketId, userId]);
      
      if (accessCheck.rows.length > 0) {
        return next();
      }
      
      return res.status(403).json({ message: 'No tienes acceso a este ticket' });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error verificando acceso al ticket:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

// Middleware para verificar permisos de edición (solo admin y tech pueden editar)
function canEditParticipants(req, res, next) {
  const userRole = req.user.role;
  
  if (userRole === 'admin' || userRole === 'tech') {
    return next();
  }
  
  return res.status(403).json({ message: 'No tienes permisos para editar participantes en este ticket' });
}

// Obtener participantes de un ticket
router.get('/:ticketId/participants', canViewTicket, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT DISTINCT
          u.id as user_id,
          u.username,
          CONCAT(u.firstname, ' ', u.lastname) as full_name,
          u.role,
          u.email
        FROM tickets t
        JOIN users u ON u.id = ANY(t.participants)
        WHERE t.id = $1 AND array_length(t.participants, 1) > 0
        ORDER BY full_name
      `, [ticketId]);
      
      res.json(result.rows);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error obteniendo participantes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Agregar participante a un ticket
router.post('/:ticketId/participants', canEditParticipants, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'ID de usuario requerido' });
    }
    
    const client = await pool.connect();
    try {
      // Verificar que el usuario existe
      const userCheck = await client.query('SELECT id, firstname, lastname FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      
      // Verificar que el ticket existe y obtener participantes actuales
      const ticketCheck = await client.query(
        'SELECT id, user_id, assigned_to, participants FROM tickets WHERE id = $1', 
        [ticketId]
      );
      if (ticketCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Ticket no encontrado' });
      }
      
      const ticket = ticketCheck.rows[0];
      const currentParticipants = ticket.participants || [];
      
      // Verificar que no sea el creador o asignado
      if (ticket.user_id == userId || ticket.assigned_to == userId) {
        return res.status(400).json({ 
          message: 'No se puede agregar al creador o técnico asignado como participante adicional' 
        });
      }
      
      // Verificar que no esté ya en participantes
      if (currentParticipants.includes(parseInt(userId))) {
        return res.status(400).json({ message: 'El usuario ya es participante del ticket' });
      }
      
      // Agregar participante al array
      const newParticipants = [...currentParticipants, parseInt(userId)];
      
      await client.query(
        'UPDATE tickets SET participants = $1 WHERE id = $2',
        [newParticipants, ticketId]
      );
      
      const user = userCheck.rows[0];
      res.status(201).json({
        message: 'Participante agregado exitosamente',
        participant: {
          user_id: parseInt(userId),
          username: user.username,
          full_name: `${user.firstname} ${user.lastname}`
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error agregando participante:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Remover participante de un ticket  
router.delete('/:ticketId/participants/:userId', canEditParticipants, async (req, res) => {
  try {
    const { ticketId, userId } = req.params;
    
    const client = await pool.connect();
    try {
      // Obtener ticket y participantes actuales
      const ticketResult = await client.query(
        'SELECT participants FROM tickets WHERE id = $1', 
        [ticketId]
      );
      
      if (ticketResult.rows.length === 0) {
        return res.status(404).json({ message: 'Ticket no encontrado' });
      }
      
      const currentParticipants = ticketResult.rows[0].participants || [];
      const userIdInt = parseInt(userId);
      
      if (!currentParticipants.includes(userIdInt)) {
        return res.status(404).json({ message: 'Usuario no es participante del ticket' });
      }
      
      // Remover participante del array
      const newParticipants = currentParticipants.filter(id => id !== userIdInt);
      
      await client.query(
        'UPDATE tickets SET participants = $1 WHERE id = $2',
        [newParticipants, ticketId]
      );
      
      // Obtener nombre del usuario para el mensaje
      const userResult = await client.query(
        'SELECT firstname, lastname FROM users WHERE id = $1', 
        [userId]
      );
      const user = userResult.rows[0];
      
      res.json({
        message: `${user.firstname} ${user.lastname} removido del ticket exitosamente`
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error removiendo participante:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener usuarios disponibles para agregar como participantes
router.get('/:ticketId/available-users', canViewTicket, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { search = '' } = req.query;
    
    const client = await pool.connect();
    try {
      // Obtener el ticket para excluir creador, asignado y participantes actuales
      const ticketResult = await client.query(
        'SELECT user_id, assigned_to, participants FROM tickets WHERE id = $1',
        [ticketId]
      );
      
      if (ticketResult.rows.length === 0) {
        return res.status(404).json({ message: 'Ticket no encontrado' });
      }
      
      const ticket = ticketResult.rows[0];
      const excludedIds = [ticket.user_id, ticket.assigned_to, ...(ticket.participants || [])].filter(id => id != null);
      
      let query = `
        SELECT 
          u.id, 
          u.username, 
          CONCAT(u.firstname, ' ', u.lastname) as full_name, 
          u.email, 
          u.role
        FROM users u
        WHERE u.status = true
      `;
      
      let params = [];
      let paramIndex = 1;
      
      if (excludedIds.length > 0) {
        query += ` AND u.id NOT IN (${excludedIds.map(id => `$${paramIndex++}`).join(',')})`;
        params.push(...excludedIds);
      }
      
      if (search) {
        query += ` AND (
          u.firstname ILIKE $${paramIndex} OR 
          u.lastname ILIKE $${paramIndex} OR 
          u.username ILIKE $${paramIndex} OR 
          u.email ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
      }
      
      query += ` ORDER BY u.firstname, u.lastname LIMIT 20`;
      
      const result = await client.query(query, params);
      
      res.json(result.rows);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error obteniendo usuarios disponibles:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
