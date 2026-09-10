module.exports = {
    apps: [
      {
        name: 'presentickets-backend', // Nombre de la aplicación
        script: './server.js', // Archivo principal del backend
        env: {
          NODE_ENV: 'development', // Entorno de desarrollo
          PORT: 3000
        },
        env_production: {
          NODE_ENV: 'production', // Entorno de producción
          PORT: 3000,
          // Configuración de Email Monitor (IMAP)
          EMAIL_MONITOR_HOST: 'imap.gmail.com',
          EMAIL_MONITOR_PORT: 993,
          EMAIL_MONITOR_INTERVAL: 120000
        }
      }
    ]
  };