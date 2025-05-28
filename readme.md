# Sistema de Gestión de Tickets para Clínica - PresenTickets

**Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.**

Este proyecto es una aplicación web para gestionar tickets entre usuarios internos de una clínica y técnicos. La aplicación permite a los usuarios crear, ver y actualizar tickets, mientras que los técnicos pueden gestionar y resolver los tickets asignados.

## Aviso de Propiedad Intelectual

PresenTickets es propiedad intelectual exclusiva de Diego Sánchez, quien ha desarrollado este sistema como iniciativa personal. El uso de este software por parte de Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.

Está prohibida la redistribución, modificación o uso no autorizado de este código sin el consentimiento expreso por escrito del autor.

## Documentación Legal

En la carpeta `Documentacion` se encuentran los siguientes archivos importantes:
- `terminos_de_uso.md`: Términos y condiciones de uso del sistema
- `3_documentacion_tecnica.md`: Documentación técnica con declaración de propiedad
- `4_plantillas_comunicacion.md`: Plantillas para comunicaciones formales
- `5_guia_implementacion_copyright.md`: Guía para implementar avisos de copyright
- `6_instrucciones_implementacion.md`: Instrucciones detalladas de implementación
- `plan_revision_periodica.md`: Plan para el mantenimiento de la protección de propiedad intelectual

## Herramientas de Protección de Copyright

El repositorio incluye varios scripts para mantener la protección de propiedad intelectual:
- `scripts/add-copyright.js`: Añade avisos de copyright a archivos sin ellos
- `scripts/check-missing-copyrights.js`: Verifica archivos que necesitan avisos de copyright
- `scripts/update-copyright-year.js`: Actualiza el año en los avisos de copyright existentes

También se ha implementado un hook de Git que verifica la presencia de avisos de copyright antes de permitir commits.

## Estructura del Proyecto

El proyecto está dividido en dos partes principales:

- **Backend**: Implementado con Node.js y Express.
- **Frontend**: Implementado con Angular.

## Requisitos

- Node.js (versión 14 o superior)
- Angular CLI (versión 12 o superior)

## Instalación

### Backend

1. Navega al directorio `Backend`:
    ```sh
    cd Backend
    ```

2. Instala las dependencias:
    ```sh
    npm install
    ```

3. Configura las variables de entorno en un archivo `.env` (opcional).

4. Inicia el servidor:
    ```sh
    npm start
    ```

### Frontend

1. Navega al directorio [Frontend](http://_vscodecontentref_/1):
    ```sh
    cd Frontend
    ```

2. Instala las dependencias:
    ```sh
    npm install
    ```

3. Inicia el servidor de desarrollo:
    ```sh
    ng serve
    ```

4. Abre tu navegador y navega a [http://localhost:4200/](http://_vscodecontentref_/2).

## Uso

### Crear un Ticket

1. Inicia sesión en la aplicación.
2. Navega a la sección de creación de tickets.
3. Completa el formulario con la información del ticket.
4. Adjunta archivos si es necesario.
5. Haz clic en "Crear Ticket".

### Ver y Gestionar Tickets

1. Inicia sesión como técnico o administrador.
2. Navega a la lista de tickets.
3. Haz clic en un ticket para ver los detalles.
4. Actualiza el estado del ticket, asigna técnicos, y añade comentarios según sea necesario.

## Estructura de Archivos

### Backend

- [server.js](http://_vscodecontentref_/3): Configuración principal del servidor.
- `routes/`: Contiene las rutas de la API.
- `uploads/`: Directorio para archivos adjuntos.

### Frontend

- `src/app/`: Contiene los componentes de Angular.
- `src/assets/`: Contiene los recursos estáticos.
- `src/environments/`: Configuración de entornos.

## Contribuir

1. Haz un fork del repositorio.
2. Crea una nueva rama (`git checkout -b feature/nueva-funcionalidad`).
3. Realiza tus cambios y haz commit (`git commit -am 'Añadir nueva funcionalidad'`).
4. Haz push a la rama (`git push origin feature/nueva-funcionalidad`).
5. Abre un Pull Request.

## Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.