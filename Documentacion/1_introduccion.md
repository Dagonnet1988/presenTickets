# PresenTickets - Sistema de Gestión de Tickets

## Introducción

PresenTickets es una aplicación web completa diseñada para la gestión eficiente de tickets de soporte técnico en la Clínica de la Presentación. Proporciona un sistema integral para el registro, seguimiento y resolución de incidentes y solicitudes técnicas, mejorando significativamente la comunicación entre usuarios y el equipo de soporte técnico.

## Características Principales

- **Gestión Completa de Tickets**: Creación, seguimiento, actualización y cierre de tickets de soporte.
- **Notificaciones en Tiempo Real**: Sistema de notificaciones para mantener informados a usuarios y técnicos sobre actualizaciones de tickets.
- **Sistema de Comentarios**: Comunicación bidireccional entre usuarios y técnicos mediante comentarios en tickets.
- **Adjuntos de Archivos**: Capacidad para adjuntar archivos a tickets y comentarios para mejor contexto.
- **Asignación de Técnicos**: Asignación manual de tickets a técnicos específicos.
- **Escalamiento de Tickets**: Posibilidad de escalar tickets a niveles superiores o externos.
- **Estados Personalizados**: Seguimiento del ciclo de vida del ticket mediante estados predefinidos.
- **Priorización de Tickets**: Categorización de tickets por nivel de urgencia.
- **Autenticación Segura**: Sistema de autenticación basado en JWT para garantizar la seguridad.
- **Roles de Usuario**: Diferentes niveles de acceso según el rol (usuario, técnico, administrador).

## Tecnologías Utilizadas

### Backend
- **Node.js**: Entorno de ejecución para JavaScript del lado del servidor.
- **Express**: Framework web para la creación de APIs RESTful.
- **PostgreSQL**: Sistema de gestión de base de datos relacional.
- **Socket.io**: Biblioteca para la comunicación en tiempo real.
- **JSON Web Tokens (JWT)**: Para la autenticación segura de usuarios.
- **Formidable**: Procesamiento de formularios y carga de archivos.
- **Node-cron**: Programación de tareas automáticas.

### Frontend
- **Angular**: Framework de desarrollo frontend basado en TypeScript.
- **Angular Material**: Biblioteca de componentes de interfaz de usuario.
- **RxJS**: Biblioteca para programación reactiva.
- **Socket.io-client**: Cliente para comunicación en tiempo real con el backend.

## Arquitectura del Sistema

PresenTickets sigue una arquitectura cliente-servidor con separación clara entre el frontend y el backend:

1. **Frontend (Cliente)**: Aplicación Angular que proporciona la interfaz de usuario.
2. **Backend (Servidor)**: API RESTful construida con Express que gestiona la lógica de negocio y el acceso a datos.
3. **Base de Datos**: PostgreSQL que almacena toda la información persistente del sistema.
4. **Comunicación en Tiempo Real**: Socket.io para notificaciones instantáneas entre servidor y clientes.

Esta arquitectura permite una clara separación de responsabilidades, facilitando el mantenimiento y la escalabilidad del sistema.
