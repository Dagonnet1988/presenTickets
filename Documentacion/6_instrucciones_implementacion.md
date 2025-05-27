# Instrucciones para Implementación de Protección de Propiedad Intelectual

Este documento proporciona instrucciones detalladas para la implementación completa de las medidas de protección de propiedad intelectual en el sistema PresentiTickets. Estas instrucciones están dirigidas al personal técnico responsable de la implementación.

## Paso 1: Implementación de Avisos de Copyright en el Código

### 1.1 Ejecución del Script Automático

Se ha desarrollado un script que automatiza la implementación de avisos de copyright en los archivos clave del sistema. Para ejecutarlo:

```powershell
cd "c:\Users\SISTEMAS3\Documents\Diego\Presentickets"
node scripts/improve-copyright-implementation.js
```

Este script añadirá automáticamente las cabeceras de copyright a:
- Archivos principales del backend
- Archivos de rutas del backend
- Componentes principales del frontend
- Servicios clave del frontend

### 1.2 Revisión Manual de Archivos Importantes

Después de ejecutar el script, realizar una revisión manual para verificar la correcta implementación en archivos críticos:

1. **Backend**:
   - `server.js`
   - `dbInit.js`
   - Los archivos en la carpeta `routes/`

2. **Frontend**:
   - `app.component.ts`
   - `notification-bell.component.ts`
   - `notification.service.ts`

### 1.3 Inclusión en Archivos Nuevos

Para todos los nuevos archivos que se creen, se debe incluir el aviso de copyright correspondiente. Usar como referencia las plantillas en:
`c:\Users\SISTEMAS3\Documents\Diego\Presentickets\Documentacion\copyright_headers.js`

## Paso 2: Implementación del Componente "Acerca de"

Se ha creado un componente "Acerca de" que incluye información sobre la propiedad intelectual del sistema:

1. **Verificar Implementación**:
   - Comprobar que el componente `about.component.ts` está correctamente importado
   - Verificar que la ruta `/about` está configurada en `app.routes.ts`
   - Confirmar que se muestra el enlace en el menú lateral

2. **Acceso desde el Menú**:
   - El componente debe ser accesible desde el menú lateral con el ícono "info"
   - También debe ser accesible desde el pie de página

## Paso 3: Implementación del Pie de Página con Información Legal

Se ha creado un componente de pie de página que incluye información de copyright:

1. **Verificar Implementación**:
   - Comprobar que el componente `footer.component.ts` está correctamente integrado en el layout principal
   - Confirmar que muestra el aviso de copyright con el año actual

2. **Actualización Anual**:
   - El año en el aviso de copyright debe actualizarse automáticamente usando:
     ```typescript
     currentYear = new Date().getFullYear();
     ```

## Paso 4: Distribución de la Documentación Legal

Los siguientes documentos legales deben estar disponibles para referencia:

1. **Términos de Uso**:
   - Archivo: `c:\Users\SISTEMAS3\Documents\Diego\Presentickets\Documentacion\terminos_de_uso.md`
   - Este documento debe ser convertido a PDF y estar disponible para consulta

2. **Documentación Técnica con Declaración de Propiedad**:
   - Archivo: `c:\Users\SISTEMAS3\Documents\Diego\Presentickets\Documentacion\3_documentacion_tecnica.md`
   - Debe mantenerse actualizada con cada cambio significativo en el sistema

3. **Guía de Implementación de Copyright**:
   - Archivo: `c:\Users\SISTEMAS3\Documents\Diego\Presentickets\Documentacion\5_guia_implementacion_copyright.md`
   - Este documento debe compartirse con todos los desarrolladores del proyecto

## Paso 5: Comunicación Formal a la Dirección

Para formalizar la propiedad intelectual del sistema, es necesario comunicarlo oficialmente a la dirección de la Clínica:

1. **Envío de Comunicación**:
   - Utilizar la plantilla en `c:\Users\SISTEMAS3\Documents\Diego\Presentickets\Documentacion\4_plantillas_comunicacion.md`
   - Personalizar con los datos correspondientes y convertir a formato formal
   - Incluir los documentos de Términos de Uso y Documentación Técnica como anexos

2. **Seguimiento**:
   - Solicitar acuse de recibo de la comunicación
   - Programar una reunión para resolver dudas si es necesario

## Paso 6: Configuración de Hooks de Git

Para garantizar que los nuevos archivos incluyan siempre los avisos de copyright, configurar hooks de git:

1. **Crear Hook de Pre-commit**:
   
   Crear un archivo en `.git/hooks/pre-commit` con el siguiente contenido:

   ```bash
   #!/bin/bash
   
   # Verificar archivos nuevos o modificados
   FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|html|css|scss)$')
   
   if [ -n "$FILES" ]; then
     echo "Verificando avisos de copyright en archivos nuevos o modificados..."
     for FILE in $FILES; do
       if ! grep -q "Copyright (c)" "$FILE"; then
         echo "⚠️ Advertencia: El archivo $FILE no contiene aviso de copyright."
         echo "Por favor, añade el aviso de copyright correspondiente antes de hacer commit."
         exit 1
       fi
     done
   fi
   
   exit 0
   ```

2. **Hacer el Hook Ejecutable**:
   ```bash
   chmod +x .git/hooks/pre-commit
   ```

## Paso 7: Mantenimiento Continuo

1. **Actualización Anual de Años en Avisos de Copyright**:
   - Al comienzo de cada año, ejecutar un script que actualice los años en todos los avisos de copyright
   - Esto puede automatizarse como parte del proceso de CI/CD

2. **Revisiones Periódicas**:
   - Programar revisiones trimestrales para verificar que todos los archivos nuevos incluyen los avisos de copyright
   - Actualizar la documentación legal según sea necesario

3. **Mantenimiento de Registros**:
   - Mantener un registro de todas las comunicaciones formales relacionadas con la propiedad intelectual
   - Documentar cualquier acuerdo o modificación a los términos de uso

## Paso 8: Inclusión en el Proceso de Desarrollo

1. **Integración en el Flujo de Trabajo**:
   - Incluir la verificación de avisos de copyright en la lista de comprobación para revisiones de código
   - Incluir la revisión de documentación legal en el proceso de lanzamiento de nuevas versiones

2. **Capacitación del Equipo**:
   - Informar a todos los desarrolladores sobre la importancia de los avisos de copyright
   - Proporcionar acceso a las plantillas y documentación relevante

---

## Verificación Final

Utilizar esta lista de comprobación para verificar que todas las medidas de protección de propiedad intelectual se han implementado correctamente:

- [ ] Avisos de copyright añadidos a los archivos principales
- [ ] Componente "Acerca de" implementado y accesible
- [ ] Pie de página con información de copyright visible en toda la aplicación
- [ ] Documentación legal distribuida y accesible
- [ ] Comunicación formal enviada a la dirección
- [ ] Hooks de git configurados para verificar nuevos archivos
- [ ] Proceso de mantenimiento continuo establecido
- [ ] Equipo de desarrollo informado y capacitado

---

**Fecha de implementación:** ________________

**Responsable de implementación:** ________________

**Verificado por:** ________________
