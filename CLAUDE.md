# CLAUDE.md — PresenTickets

Guía para trabajar en este repositorio. Sistema interno de gestión de tickets de soporte para
**Clínica La Presentación**. Software con licencia (propiedad de Diego Sánchez) — todo archivo
fuente nuevo lleva la cabecera de copyright del proyecto (ver cualquier archivo en `Backend/routes/`).

## Arquitectura

- **Backend/** — Node.js + Express (ESM, `"type": "module"`), PostgreSQL vía `pg` Pool,
  Socket.IO para tiempo real, `whatsapp-web.js` + Puppeteer para notificaciones WhatsApp,
  `node-cron` para tareas programadas. Se despliega con PM2 (`Backend/ecosystem.*`).
- **Frontend/** — Angular 19 standalone components + Angular Material, `socket.io-client`.
- **Documentacion/** — documentos funcionales y de licencia (Markdown).
- Un solo inquilino / una sola instalación. No hay multi-tenant.

## Cómo ejecutar

| | Dev | Prod |
|---|---|---|
| Backend (`Backend/`) | `npm run dev` (nodemon, puerto 3000) | PM2 con `ecosystem.production.config.json` |
| Frontend (`Frontend/`) | `npm start` (`ng serve`, puerto 4200) | `npm run build` |

No hay suite de pruebas automatizadas — la verificación es manual.

## Base de datos y migraciones

- El esquema se crea y migra en `Backend/dbInit.js`, que corre **al arrancar el servidor**
  (`checkAndCreateTables()` en `server.js`).
- Patrón idempotente: se comprueba si la tabla/columna existe en `information_schema` y solo
  entonces se hace `CREATE TABLE` / `ALTER TABLE ... ADD COLUMN`.
- **Cualquier columna nueva se agrega ahí siguiendo ese patrón.** No hay herramienta de
  migraciones externa.
- Tablas clave: `users`, `tickets`, `comments`, `attachments`, `notifications`,
  `whatsapp_notifications`, `user_preferences_settings`, `system_settings` (fila única `id = 1`
  con la configuración global), `ticket_history`, `ticket_surveys`, `maintenance_status`.

## Modelo de dominio

- **Roles** (`users.role`): `admin`, `tech`, `user`.
- **`users.status`** (boolean): usuario activo/inactivo. Ojo: hoy el login **no** valida este campo.
- **Estados de ticket** (`tickets.status`, texto libre en español):
  `Creado`, `En revisión`, `En proceso`, `En gestión`, `Esperando respuesta del usuario`,
  `Escalado a externo`, `Escalado a Tier 3 / Gerente de Cuenta`, `Resuelto`, `Cerrado`.
- **`tickets`**: `user_id` = creador, `assigned_to` = técnico asignado,
  `participants` = `integer[]` de usuarios adicionales.

## Notificaciones

Tres canales para el mismo evento:

1. **Campana (in-app)** — tabla `notifications`, entregada por Socket.IO + polling del frontend.
2. **WhatsApp** — `whatsapp-web.js`; log en `whatsapp_notifications`.
3. **Notificación nativa del navegador** — solo si la pestaña está en segundo plano.

Punto único de entrada: **`createNotification()` en `Backend/routes/notifications.js`** — inserta la
fila en `notifications` y dispara `sendWhatsAppNotification()` de forma asíncrona.
El emit de Socket.IO se hace con `emitTicketNotification()` / `io` desde `Backend/server.js`.
En el frontend, `NotificationService` (`Frontend/src/app/shared/services/notification.service.ts`)
mantiene el estado de la campana.

Gating de WhatsApp (en orden): servicio conectado → `system_settings.whatsapp_global_*` →
horario laboral (`isBusinessHours()`) → `user_preferences_settings` del destinatario → rate limits.

## WhatsApp / whatsapp-web.js

- Versión **fijada e inestable**: `whatsapp-web.js` está en `^1.34.5-alpha.3`. Cada actualización
  suele romper la API interna (`markedUnread`, `sendSeen`, `detached Frame`, `Target closed`).
  `server.js` ya filtra esos errores para que no tumben el proceso.
- **No actualizar `whatsapp-web.js` sin un plan de prueba.** Fijar versión exacta (sin `^`) y
  validar conexión + envío en un entorno de prueba antes de subir a producción.
- Sesión de WhatsApp persistida en `Backend/whatsapp_auth_web/`.

## Convenciones

- Identificadores, comentarios y mensajes al usuario **en español**.
- Acceso a BD: `const client = await pool.connect()` … `finally { client.release() }`.
  Para consultas sueltas se usa `pool.query(...)` directamente.
- Zona horaria de referencia: `America/Bogota`.
- Cabecera de copyright en cada archivo fuente nuevo.
- El backend no debe caerse por errores de WhatsApp/Puppeteer — capturarlos y loguear.
