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

- **Backend** (`Backend/`): dev `npm run dev` (nodemon, puerto 3000); prod PM2 con `ecosystem.production.config.json`.
- **Frontend** (`Frontend/`): dev `npm start` (`ng serve`, puerto 4200); prod `npm run build`.

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

**Punto ÚNICO de entrega: `createNotification()` en `Backend/routes/notifications.js`.**
Hace todo el trabajo de una notificación: (1) verifica que el destinatario exista y esté
`status = true`, (2) deduplica el mismo evento repetido en 10s (salvo `dedupe: false`, que usan
los comentarios), (3) inserta la fila en `notifications`, (4) emite el socket
`ticket-notification` SOLO al destinatario con el id real de BD, (5) dispara
`sendWhatsAppNotification()` async.
**No llamar a `emitTicketNotification()` por separado para un evento que ya pasa por
`createNotification()`** — genera notificaciones dobles en la campana.

En el frontend, `NotificationService` (`Frontend/src/app/shared/services/notification.service.ts`)
reconstruye SIEMPRE la lista de la campana desde el backend (`fetchUnreadNotifications`, con
debounce). El handler de socket no crea items locales.

Gating de WhatsApp (en orden): servicio conectado → `system_settings.whatsapp_global_*` →
`system_settings.whatsapp_recipient_scope` (`all` | `tech_only`; en `tech_only` no se envía a
rol `user`) → destinatario activo → horario laboral (`isBusinessHours()`) →
`user_preferences_settings` del destinatario → rate limits.

`system_settings` (fila `id = 1`) también guarda `max_pending_user_tickets` (default 3): tope de
tickets en estado "Esperando respuesta del usuario" que un rol `user` puede tener antes de que
se le bloquee crear tickets nuevos (`POST /api/tickets` → 409 `PENDING_LIMIT`;
`GET /api/tickets/creation-eligibility` para consultarlo desde el frontend).

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
