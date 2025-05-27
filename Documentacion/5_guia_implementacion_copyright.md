# Guía de Implementación de Avisos de Copyright

Esta guía proporciona instrucciones detalladas para implementar los avisos de copyright en todos los archivos del sistema PresentiTickets.

## 1. Propósito

La implementación de avisos de copyright cumple varios propósitos importantes:

- Establece claramente la propiedad intelectual del código
- Informa a cualquier persona que acceda al código sobre las restricciones de uso
- Protege legalmente el software contra usos no autorizados
- Cumple con las mejores prácticas de desarrollo de software

## 2. Tipos de Avisos de Copyright

### 2.1 Archivos JavaScript/TypeScript

Para archivos `.js`, `.ts`, `.jsx` y `.tsx`, utilizar el siguiente formato:

```javascript
/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */
```

### 2.2 Archivos HTML

Para archivos `.html`, utilizar el siguiente formato:

```html
<!--
  PresentiTickets - Sistema de Gestión de Tickets de Soporte
  Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
  
  Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
  desarrollado como iniciativa personal por Diego Sánchez.
  
  Uso autorizado únicamente según los términos del acuerdo de licencia.
  Este software es propiedad intelectual de Diego Sánchez y su uso en 
  Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
  
  Está prohibida la redistribución, modificación o uso no autorizado
  de este código sin el consentimiento expreso por escrito del autor.
-->
```

### 2.3 Archivos CSS/SCSS

Para archivos `.css` y `.scss`, utilizar el siguiente formato:

```css
/*
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */
```

### 2.4 Archivos SQL

Para archivos `.sql`, utilizar el siguiente formato:

```sql
/*
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 * 
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en 
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 * 
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */
```

### 2.5 Archivos de Configuración

Para archivos como `.json`, `.yaml`, `.env.example`, etc., utilizar el formato adecuado según el tipo de archivo:

Para JSON:
```json
{
  "_copyright": "PresentiTickets - Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.",
  // Resto del contenido
}
```

Para YAML, ENV, etc.:
```
# PresentiTickets - Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
# Uso autorizado únicamente según los términos del acuerdo de licencia.
```

## 3. Lugares de Implementación

### 3.1 Código Fuente

- Implementar en la parte superior de cada archivo de código, después de cualquier declaración de módulo o importación en lenguajes que lo requieran.
- Para archivos muy grandes o generados automáticamente, puede ser suficiente colocar el aviso en los archivos principales o índices.

### 3.2 Interfaz de Usuario

- Incluir un aviso de copyright en el pie de página de la aplicación:

```html
<div class="footer-copyright">
  © 2023-2025 Diego Sánchez. PresentiTickets. Todos los derechos reservados.
</div>
```

- Crear una página de "Acerca de" o "Información Legal" accesible desde el menú de la aplicación, que incluya:
  - Aviso completo de copyright
  - Resumen de términos de uso
  - Información de contacto para cuestiones legales

### 3.3 Documentación

- Incluir el aviso de copyright en la primera página de toda la documentación generada.
- Incluir declaraciones de propiedad intelectual en los manuales de usuario y técnicos.

## 4. Script de Implementación Automática

Para facilitar la implementación de los avisos de copyright, se ha desarrollado un script que automatiza este proceso. El script está disponible en:

```
/scripts/add-copyright.js
```

### Uso del Script:

```bash
node scripts/add-copyright.js [directorio]
```

Este script:
1. Recorre recursivamente el directorio especificado
2. Identifica el tipo de archivo
3. Añade el aviso de copyright apropiado si no existe ya
4. Genera un reporte de los archivos modificados

## 5. Verificación y Cumplimiento

Después de implementar los avisos de copyright:

1. Realizar una revisión manual de los archivos principales para verificar que los avisos se han añadido correctamente.
2. Configurar un hook de git pre-commit para verificar la presencia de avisos de copyright en archivos nuevos.
3. Documentar el proceso en el manual de desarrollo para asegurar que los nuevos archivos creados incluyan los avisos apropiados.

## 6. Página de Información Legal en la Aplicación

Implementar una página de información legal en la aplicación con las siguientes secciones:

### Aviso de Copyright

```
© 2023-2025 Diego Sánchez. Todos los derechos reservados.

PresentiTickets es un sistema de gestión de tickets de soporte técnico desarrollado por Diego Sánchez como una iniciativa personal. El sistema, incluyendo su código fuente, diseño, estructura, lógica de negocio y documentación, es propiedad intelectual exclusiva de Diego Sánchez.

El uso de este software por parte de Clínica La Presentación está autorizado mediante una licencia no exclusiva y no transferible, según los términos establecidos en el acuerdo de licencia.

Está prohibida la redistribución, modificación, ingeniería inversa, descompilación o desensamblaje de este software sin el consentimiento expreso por escrito del autor.
```

### Términos de Uso Resumidos

Incluir un resumen de los términos de uso, con un enlace para descargar el documento completo.

### Contacto Legal

Incluir información de contacto para cuestiones legales relacionadas con el software.

## 7. Calendario de Implementación

La implementación de los avisos de copyright se realizará en las siguientes fases:

1. **Fase 1 (Semana 1):** Implementación en archivos principales de backend y frontend
2. **Fase 2 (Semana 2):** Implementación en módulos secundarios y utilidades
3. **Fase 3 (Semana 3):** Implementación en la interfaz de usuario y documentación
4. **Fase 4 (Semana 4):** Verificación final y correcciones

## 8. Recomendaciones Finales

- Mantener un registro de todos los archivos que han recibido avisos de copyright.
- Establecer un proceso para asegurar que los nuevos archivos incluyan los avisos apropiados.
- Actualizar periódicamente los años en los avisos de copyright.
- Considerar la posibilidad de registrar formalmente el copyright del software.

---

*Este documento es confidencial y para uso interno. © 2023-2025 Diego Sánchez. Todos los derechos reservados.*
