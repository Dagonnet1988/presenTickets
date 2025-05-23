module.exports = {
    apps: [
      {
        name: 'Presentickets-Backend', // Nombre de la aplicación
        script: './server.js', // Archivo principal del backend
        env: {
          NODE_ENV: 'development', // Entorno de desarrollo
          PORT: 3000
        },
        env_production: {
          NODE_ENV: 'production', // Entorno de producción
          PORT: 3000
        }
      }
    ]
  };