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

import bcrypt from 'bcrypt';

const password = '$todopuede'; // La contraseña que deseas encriptar
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error al encriptar la contraseña:', err);
  } else {
    console.log('Contraseña encriptada:', hash);
    // Inserta el hash en la base de datos
    // Por ejemplo, puedes ejecutar una consulta SQL para insertar el usuario con el hash generado
    // Aquí puedes imprimir el comando SQL que necesitas ejecutar en tu base de datos
    console.log(`INSERT INTO users (username, password, role) VALUES ('admin', '${hash}', 'admin');`);
  }
});
