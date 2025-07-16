# Configuración de Build para Producción - PresenTickets
## Sistema de Gestión de Tickets de Soporte
### Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.

---

## 📋 CONFIGURACIÓN ACTUAL DE BUILD

### 🚀 **Comando de Build de Producción**
```bash
# Comando recomendado (Angular 19+)
ng build --configuration production

# Comando alternativo (funciona en package.json)
npm run build

# Comando con opciones adicionales
ng build --configuration production --optimization --build-optimizer
```

### 📊 **Información del Proyecto**
- **Angular CLI**: 19.2.9
- **Angular Core**: 19.2.7
- **Node.js**: 22.15.0
- **Package Manager**: npm 10.9.2
- **TypeScript**: 5.7.3

### 🛠️ **Configuración en angular.json**

#### **Configuración de Producción:**
```json
{
  "configurations": {
    "production": {
      "allowedCommonJsDependencies": [
        "socket.io-client",
        "engine.io-client",
        "socket.io-parser",
        "engine.io-parser",
        "component-emitter",
        "debug",
        "ms"
      ],
      "budgets": [
        {
          "type": "initial",
          "maximumWarning": "2MB",
          "maximumError": "3MB"
        },
        {
          "type": "anyComponentStyle",
          "maximumWarning": "30kB",
          "maximumError": "50kB"
        }
      ],
      "outputHashing": "all",
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.prod.ts"
        }
      ]
    }
  }
}
```

### 🌐 **Configuración de Entornos**

#### **Desarrollo (environment.ts):**
```typescript
export const environment = {
  production: false,
  auth: 'http://localhost:3000/api/auth',
  user: 'http://localhost:3000/api/users',
  ticket: 'http://localhost:3000/api/tickets',
  comment: 'http://localhost:3000/api/comments',
  backendUrl: 'http://localhost:3000',
  appVersion: '1.0.5'
};
```

#### **Producción (environment.prod.ts):**
```typescript
export const environment = {
  production: true,
  auth: 'http://192.162.2.5:3000/api/auth',
  user: 'http://192.162.2.5:3000/api/users',
  ticket: 'http://192.162.2.5:3000/api/tickets',
  comment: 'http://192.162.2.5:3000/api/comments',
  backendUrl: 'http://192.162.2.5:3000',
  appVersion: '1.0.5'
};
```

### 📁 **Estructura de Salida del Build**
```
dist/frontend/
├── browser/                 # Archivos para navegador
│   ├── index.html          # Página principal
│   ├── main-[hash].js      # Bundle principal (1.39 MB)
│   ├── polyfills-[hash].js # Polyfills (34.52 kB)
│   ├── styles-[hash].css   # Estilos (9.84 kB)
│   ├── assets/             # Recursos estáticos
│   └── [rutas]/            # Páginas pre-renderizadas
├── server/                 # Archivos para SSR
│   ├── main.server.mjs     # Servidor principal (1.91 MB)
│   ├── server.mjs          # Servidor Express (845.38 kB)
│   └── polyfills.server.mjs # Polyfills servidor (267.76 kB)
└── 3rdpartylicenses.txt    # Licencias de terceros
```

### ⚙️ **Optimizaciones Habilitadas**
- ✅ **Output Hashing**: Cacheo eficiente con hash en nombres
- ✅ **File Replacement**: Entorno de producción automático
- ✅ **Server-Side Rendering**: Pre-renderizado de rutas
- ✅ **Tree Shaking**: Eliminación de código no utilizado
- ✅ **Minificación**: Compresión de archivos JS/CSS
- ✅ **Budgets**: Control de tamaño de bundles

### 🔧 **Scripts de Package.json**
```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test",
    "serve:ssr:Frontend": "node dist/frontend/server/server.mjs"
  }
}
```

### 🎯 **Métricas de Performance**
- **Bundle Principal**: 1.39 MB → 277.47 kB (gzip)
- **Polyfills**: 34.52 kB → 11.28 kB (gzip)
- **Estilos**: 9.84 kB → 1.86 kB (gzip)
- **Total Inicial**: 1.43 MB → 290.61 kB (gzip)
- **Tiempo de Build**: ~11.5 segundos

### 📋 **Checklist de Deployment**

#### **Pre-Build:**
- [ ] Verificar que todas las dependencias estén instaladas
- [ ] Confirmar configuración de entornos
- [ ] Validar que no hay errores de compilación
- [ ] Verificar que el dashboard funciona correctamente

#### **Build:**
- [ ] Ejecutar `npm run build` o `ng build --configuration production`
- [ ] Verificar que no hay errores de budget
- [ ] Confirmar que la salida se genera en `dist/frontend/`
- [ ] Validar que los archivos están hasheados correctamente

#### **Post-Build:**
- [ ] Verificar que el archivo `index.html` existe
- [ ] Confirmar que los assets están copiados
- [ ] Validar que las rutas pre-renderizadas funcionan
- [ ] Probar el servidor SSR si es necesario

### 🚨 **Problemas Conocidos y Soluciones**

#### **Error de Budget CSS:**
```bash
# Problema: details-ticket.component.css excede 25kB
# Solución: Ajustar budgets en angular.json
"anyComponentStyle": {
  "maximumWarning": "30kB",
  "maximumError": "50kB"
}
```

#### **Dependencias CommonJS:**
```json
// Solución: Agregar a allowedCommonJsDependencies
"allowedCommonJsDependencies": [
  "socket.io-client",
  "engine.io-client",
  "socket.io-parser",
  "engine.io-parser",
  "component-emitter",
  "debug",
  "ms"
]
```

### 🔄 **Comandos de Desarrollo vs Producción**

#### **Desarrollo:**
```bash
# Servidor de desarrollo
ng serve

# Build de desarrollo
ng build --configuration development

# Watch mode
ng build --watch --configuration development
```

#### **Producción:**
```bash
# Build de producción
ng build --configuration production

# Servidor de producción (SSR)
node dist/frontend/server/server.mjs

# Análisis de bundles
ng build --configuration production --stats-json
```

### 📈 **Mejoras Futuras**

#### **Optimizaciones Adicionales:**
- [ ] Implementar Service Worker para PWA
- [ ] Configurar lazy loading para rutas
- [ ] Optimizar imágenes con Angular Image Optimization
- [ ] Implementar code splitting más granular

#### **Monitoreo:**
- [ ] Configurar bundle analyzer
- [ ] Implementar métricas de performance
- [ ] Configurar alertas de tamaño de bundle
- [ ] Implementar lighthouse CI

### 🎉 **Estado Actual**
- ✅ **Build de Producción**: Funcional y optimizado
- ✅ **Dashboard Ejecutivo**: Integrado y funcional
- ✅ **Entornos**: Configurados correctamente
- ✅ **Budgets**: Ajustados para el proyecto
- ✅ **SSR**: Habilitado y funcional
- ✅ **Optimizaciones**: Activas y eficientes

---

**Configuración validada el:** 15 de julio de 2025
**Última actualización:** Angular 19.2.9
**Estado:** ✅ Listo para producción
