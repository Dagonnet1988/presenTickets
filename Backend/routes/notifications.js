import express from 'express';
import { pool } from '../server.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Middleware para autenticar JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log('NO TOKEN PRESENT');
    return res.sendStatus(401);
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('JWT VERIFY ERROR:', err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

// Obtener notificaciones no leídas del usuario
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener notificaciones:', err);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Marcar notificación como leída
router.post('/read/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    // Solo el dueño puede marcar como leída
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar notificación como leída' });
  }
});

// Eliminar todas las notificaciones leídas del usuario autenticado
router.delete('/read/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query('DELETE FROM notifications WHERE user_id = $1 AND is_read = true', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar notificaciones leídas' });
  }
});

// Eliminar una notificación por ID (solo si pertenece al usuario autenticado)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o no autorizada' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar notificación' });
  }
});

// Crear notificación (uso interno, no expuesto al frontend)
export async function createNotification({ user_id, type, message, ticket_id }) {
  await pool.query(
    'INSERT INTO notifications (user_id, type, message, ticket_id) VALUES ($1, $2, $3, $4)',
    [user_id, type, message, ticket_id]
  );
}

export default router;
