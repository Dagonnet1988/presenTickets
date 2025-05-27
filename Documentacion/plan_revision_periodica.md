# Plan de Revisión Periódica de Derechos de Autor - PresentiTickets

## Propósito

Este documento establece un plan sistemático para la revisión periódica y mantenimiento de los avisos de copyright y la documentación legal asociada al sistema PresentiTickets. El objetivo es garantizar la continua protección de los derechos de propiedad intelectual de Diego Sánchez sobre el sistema.

## Calendario de Revisiones

### Revisiones Trimestrales

| Período | Fecha Límite | Responsable | Elementos a Revisar |
|---------|--------------|-------------|---------------------|
| Q1 | 15 de marzo | Diego Sánchez | Archivos nuevos, documentación legal |
| Q2 | 15 de junio | Diego Sánchez | Archivos nuevos, acuerdos de licencia |
| Q3 | 15 de septiembre | Diego Sánchez | Archivos nuevos, componentes de terceros |
| Q4 | 15 de diciembre | Diego Sánchez | Archivos nuevos, plan para el siguiente año |

### Revisión Anual

| Tarea | Fecha | Descripción |
|-------|------|-------------|
| Actualización de años en avisos de copyright | 15 de enero | Ejecutar el script `update-copyright-year.js` |
| Revisión de términos de uso | 31 de enero | Actualizar términos de uso si es necesario |
| Renovación de comunicaciones | 15 de febrero | Enviar recordatorio formal a la dirección |

## Lista de Verificación para Revisiones Trimestrales

### 1. Revisión de Código

- [ ] Ejecutar verificación de archivos sin avisos de copyright
  ```
  node scripts/check-missing-copyrights.js
  ```
- [ ] Verificar implementación correcta del nombre (Diego Sánchez)
- [ ] Comprobar que el año en avisos de copyright esté actualizado
- [ ] Verificar que el hook de pre-commit funcione correctamente

### 2. Revisión de Documentación

- [ ] Confirmar que la documentación técnica refleje correctamente la propiedad intelectual
- [ ] Verificar que los términos de uso estén actualizados
- [ ] Comprobar que las plantillas de comunicación estén disponibles y actualizadas
- [ ] Revisar la sección "Acerca de" en la aplicación

### 3. Gestión de Licencias

- [ ] Revisar acuerdos de licencia con Clínica La Presentación
- [ ] Documentar cualquier uso autorizado adicional
- [ ] Verificar cumplimiento de los términos por parte de los usuarios

### 4. Registro de Cambios

| Fecha | Archivos Modificados | Cambios Realizados | Observaciones |
|-------|----------------------|-------------------|---------------|
|       |                      |                   |               |
|       |                      |                   |               |

## Procedimiento para Nuevos Desarrolladores

Para garantizar que cualquier nuevo desarrollador que trabaje en el proyecto comprenda y respete los derechos de propiedad intelectual:

1. Proporcionar documentación sobre los avisos de copyright requeridos
2. Explicar el funcionamiento del hook de pre-commit
3. Revisar la estructura de la documentación legal
4. Capacitar en el uso de los scripts de verificación y actualización

## Plan de Contingencia

En caso de detectar uso no autorizado del sistema:

1. Documentar la infracción (capturas de pantalla, registros, etc.)
2. Notificar formalmente a la entidad o persona responsable
3. Establecer un plazo para la remediación
4. Consultar asesoría legal si es necesario

---

**Implementado por:** Diego Sánchez  
**Fecha de creación:** 26 de mayo, 2025  
**Próxima revisión:** 15 de septiembre, 2025
