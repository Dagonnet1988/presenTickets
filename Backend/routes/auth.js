import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../server.js";

const router = express.Router();

// Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Validar datos de entrada
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Usuario y contraseña son obligatorios" });
  }

  const client = await pool.connect();
  try {
    // Verificar si el usuario existe
    const result = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = result.rows[0];

    // Comparar contraseñas
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Login exitoso
    res.json({
      message: "Inicio de sesión exitoso",
      user: { id: user.id, username: user.firstname +' '+ user.lastname, role: user.role },
    });
  } catch (err) {
    console.error("Error en el servidor:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

export default router;
