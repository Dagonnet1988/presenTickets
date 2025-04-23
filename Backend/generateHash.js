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