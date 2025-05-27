# Documentación Técnica - PresentiTickets

## Declaración de Propiedad

Este documento confirma que el sistema de gestión de tickets "PresentiTickets" es propiedad intelectual exclusiva de **Diego Sánchez**, quien lo ha desarrollado como una iniciativa personal para mejorar los procesos de soporte técnico en Clínica La Presentación.

**Fecha de Creación Inicial:** Enero 2023  
**Desarrollador Principal:** Diego Sánchez  
**Versión Actual:** 1.0.5  

## Arquitectura Detallada

### Modelo de Datos

#### Base de Datos PostgreSQL

El sistema utiliza una base de datos relacional PostgreSQL con las siguientes tablas principales:

1. **users**
   - Almacena información de usuarios del sistema
   - Contiene roles (usuario, técnico, administrador)
   - Gestiona información de autenticación

2. **tickets**
   - Entidad central que registra todas las solicitudes de soporte
   - Relacionada con usuarios (creador y técnico asignado)
   - Contiene metadatos como fechas, estados, prioridad

3. **comments**
   - Comentarios asociados a tickets
   - Registro de comunicaciones entre usuarios y técnicos
   - Trazabilidad de la resolución de problemas

4. **attachments**
   - Almacena metadatos de archivos adjuntos
   - Vinculados a tickets o comentarios
   - Los archivos físicos se almacenan en el sistema de archivos

5. **notifications**
   - Registro de notificaciones del sistema
   - Relacionadas con usuarios y entidades (tickets, comentarios)
   - Estados de lectura para seguimiento

### Componentes del Backend

El backend está estructurado siguiendo una arquitectura modular basada en Express:

#### Rutas Principales

- **/auth**: Gestión de autenticación y autorización
- **/tickets**: CRUD de tickets y gestión de estados
- **/comments**: Gestión de comentarios en tickets
- **/users**: Administración de usuarios y perfiles
- **/notifications**: Sistema de notificaciones
- **/attachments**: Gestión de archivos adjuntos

#### Middlewares Clave

- **authMiddleware.js**: Validación de JWT y autorización
- **uploadMiddleware.js**: Procesamiento de archivos subidos
- **errorMiddleware.js**: Manejo centralizado de errores

#### Servicios Principales

- **notificationService.js**: Gestión de notificaciones en tiempo real
- **emailService.js**: Envío de correos electrónicos
- **fileService.js**: Gestión de archivos adjuntos

### Componentes del Frontend

La aplicación frontend está desarrollada en Angular 15 siguiendo una arquitectura por módulos:

#### Módulos Principales

- **AuthModule**: Componentes y servicios de autenticación
- **TicketsModule**: Gestión completa de tickets
- **CommentsModule**: Sistema de comentarios
- **NotificationsModule**: Sistema de notificaciones
- **UsersModule**: Gestión de usuarios y perfiles
- **SharedModule**: Componentes y servicios compartidos

#### Servicios Clave

- **AuthService**: Gestión de autenticación y sesiones
- **TicketService**: Operaciones CRUD para tickets
- **NotificationService**: Sistema de notificaciones
- **SocketService**: Comunicación en tiempo real con el backend

#### Componentes Principales

- **ticket-list.component**: Listado de tickets con filtros
- **ticket-detail.component**: Vista detallada de un ticket
- **notification-bell.component**: Visualización de notificaciones
- **comment-section.component**: Sección de comentarios en tickets

## Funcionalidades Técnicas Destacadas

### 1. Sistema de Notificaciones en Tiempo Real

El sistema implementa notificaciones bidireccionales en tiempo real utilizando Socket.io:

```javascript
// Backend: Emisión de notificaciones
function emitTicketNotification(userId, ticketId, type) {
  io.to(`user_${userId}`).emit('notification', {
    type,
    ticketId,
    timestamp: new Date()
  });
}

// Frontend: Recepción de notificaciones
this.socketService.on('notification', (data) => {
  this.notificationService.addNotification(data);
});
```

### 2. Gestión de Archivos Adjuntos

El sistema permite adjuntar archivos a tickets y comentarios:

```javascript
// Backend: Almacenamiento de archivos
const uploadDir = path.join(__dirname, '../uploads');
const formidable = require('formidable');

router.post('/upload', authMiddleware, (req, res) => {
  const form = new formidable.IncomingForm({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  });
  
  form.parse(req, async (err, fields, files) => {
    // Procesamiento de archivos y almacenamiento en base de datos
  });
});
```

### 3. Sistema de Estados y Flujo de Trabajo

Los tickets siguen un flujo de trabajo definido con estados y transiciones:

```typescript
// Estados de tickets
export enum TicketStatus {
  NUEVO = 'nuevo',
  EN_PROGRESO = 'en_progreso',
  ESPERANDO_USUARIO = 'esperando_usuario',
  ESPERANDO_TERCERO = 'esperando_tercero',
  RESUELTO = 'resuelto',
  CERRADO = 'cerrado'
}

// Transiciones permitidas por rol
const allowedTransitions = {
  user: {
    'nuevo': ['cerrado'],
    'en_progreso': [],
    'esperando_usuario': ['en_progreso'],
    'esperando_tercero': [],
    'resuelto': ['cerrado', 'en_progreso'],
    'cerrado': ['nuevo']
  },
  tech: {
    'nuevo': ['en_progreso', 'cerrado'],
    'en_progreso': ['esperando_usuario', 'esperando_tercero', 'resuelto', 'cerrado'],
    'esperando_usuario': ['en_progreso', 'resuelto', 'cerrado'],
    'esperando_tercero': ['en_progreso', 'resuelto', 'cerrado'],
    'resuelto': ['en_progreso', 'cerrado'],
    'cerrado': ['nuevo']
  }
};
```

## Seguridad Implementada

1. **Autenticación basada en JWT**:
   - Tokens firmados con expiración configurada
   - Refresh tokens para mantener sesiones
   - Almacenamiento seguro en localStorage con expiración

2. **Autorización por roles**:
   - Middleware de validación de permisos
   - Acceso a rutas controlado por rol
   - Validación en frontend y backend

3. **Protección contra ataques comunes**:
   - Validación de entrada para prevenir inyecciones SQL
   - Rate limiting para prevenir ataques de fuerza bruta
   - Encabezados de seguridad HTTP (CORS, XSS, CSRF)

4. **Sanitización de datos**:
   - Limpieza de entradas de usuario
   - Validación de tipos de archivos
   - Limitación de tamaños de archivos

## Escalabilidad y Mantenimiento

### Estrategias de Escalabilidad

1. **Arquitectura modular** que permite escalar componentes individualmente
2. **Separación clara** entre frontend y backend
3. **Cache implementado** en consultas frecuentes
4. **Sistema de colas** para procesamiento de tareas pesadas

### Consideraciones de Mantenimiento

1. **Documentación de código** siguiendo estándares JSDoc/TSDoc
2. **Pruebas unitarias** para componentes críticos
3. **Logs estructurados** para facilitar depuración
4. **Sistema de control de versiones** con Git
5. **Estrategia de respaldo** para la base de datos

---

## Declaración de Derechos de Autor

© Diego Sánchez 2023-2025. Todos los derechos reservados.

Este software es propiedad intelectual exclusiva de Diego Sánchez. El uso de este software por parte de Clínica La Presentación está sujeto a los términos establecidos en el documento de "Términos de Uso" proporcionado por separado.

Queda estrictamente prohibida la reproducción, distribución, modificación o creación de obras derivadas sin el consentimiento expreso por escrito del autor.
