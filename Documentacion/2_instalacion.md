# Instalación y Configuración

## Requisitos del Sistema

### Requisitos de Software
- Node.js v14.0 o superior
- npm v6.0 o superior
- PostgreSQL v12.0 o superior
- Angular CLI v15.0 o superior

### Requisitos de Hardware Recomendados
- CPU: 2 núcleos o más
- RAM: Mínimo 4GB
- Espacio en disco: Al menos 1GB disponible

## Instalación del Backend

1. **Clonar el repositorio**:
   ```powershell
   git clone <repositorio>
   cd Presentickets/Backend
   ```

2. **Instalar dependencias**:
   ```powershell
   npm install
   ```

3. **Configurar variables de entorno**:
   Crear un archivo `.env.development` para desarrollo o `.env.production` para producción con el siguiente contenido:
   ```
   PORT=3000
   DB_USER=postgres
   DB_PASSWORD=tu_contraseña
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=presentickets
   JWT_SECRET=tu_clave_secreta_jwt
   FRONTEND_URL=http://localhost:4200
   ```

4. **Iniciar la base de datos**:
   El sistema automáticamente creará las tablas necesarias en la primera ejecución.

5. **Ejecutar el servidor**:
   ```powershell
   # Para desarrollo
   npm run start:dev
   
   # Para producción
   npm run start:prod
   ```

## Instalación del Frontend

1. **Navegar a la carpeta del frontend**:
   ```powershell
   cd ../Frontend
   ```

2. **Instalar dependencias**:
   ```powershell
   npm install
   ```

3. **Configurar entorno**:
   Revisar y ajustar la configuración en los archivos:
   - `src/environments/environment.ts` (desarrollo)
   - `src/environments/environment.prod.ts` (producción)

   Asegurarse de que la URL del backend esté correctamente configurada.

4. **Ejecutar la aplicación**:
   ```powershell
   # Para desarrollo
   ng serve
   
   # Para producción (genera los archivos de construcción)
   ng build --configuration=production
   ```

## Configuración de Producción

### Backend

1. **Configuración de PM2** (gestor de procesos para Node.js):
   ```powershell
   npm install -g pm2
   cd Backend
   pm2 start ecosystem.config.cjs
   ```

2. **Configuración de NGINX** como proxy inverso (ejemplo):
   ```nginx
   server {
       listen 80;
       server_name tudominio.com;

       location /api/ {
           proxy_pass http://localhost:3000/api/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       location /socket.io/ {
           proxy_pass http://localhost:3000/socket.io/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       location / {
           root /ruta/a/tu/frontend/dist/presentickets;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

### Frontend

1. **Construcción para producción**:
   ```powershell
   cd Frontend
   ng build --configuration=production
   ```

2. **Despliegue de archivos estáticos**:
   Copiar el contenido del directorio `dist/presentickets` al directorio raíz del servidor web configurado en NGINX.

## Verificación de la Instalación

1. **Verificar el backend**:
   Acceder a `http://localhost:3000/api/auth` - debería recibir una respuesta JSON.

2. **Verificar el frontend**:
   Acceder a `http://localhost:4200` - debería mostrar la pantalla de inicio de sesión.

3. **Verificar la conexión a la base de datos**:
   Los logs del servidor indicarán si la conexión a PostgreSQL fue exitosa.
