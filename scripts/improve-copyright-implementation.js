#!/usr/bin/env node

/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Script mejorado para añadir automáticamente avisos de copyright a archivos específicos.
 */

const fs = require('fs').promises;
const path = require('path');

// Directorios principales
const BACKEND_DIR = path.join(__dirname, '..', 'Backend');
const FRONTEND_DIR = path.join(__dirname, '..', 'Frontend');

// Rutas de archivos importantes para añadir copyright
const importantFiles = [
  // Backend - Archivos principales
  path.join(BACKEND_DIR, 'server.js'),
  path.join(BACKEND_DIR, 'dbInit.js'),
  
  // Backend - Rutas
  path.join(BACKEND_DIR, 'routes', 'auth.js'),
  path.join(BACKEND_DIR, 'routes', 'tickets.js'),
  path.join(BACKEND_DIR, 'routes', 'comments.js'),
  path.join(BACKEND_DIR, 'routes', 'notifications.js'),
  path.join(BACKEND_DIR, 'routes', 'users.js'),
  
  // Frontend - Componentes principales
  ...findAngularComponentsSync(path.join(FRONTEND_DIR, 'src', 'app')),
];

// Avisos de copyright específicos por extensión
const COPYRIGHT_NOTICES = {
  js: `/**
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

`,
    ts: `/**
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

`,
    html: `<!--
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

`,
  css: `/*
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

`
};

// Extensiones mapeadas
const EXT_MAP = {
  'js': 'js',
  'ts': 'ts',
  'jsx': 'js',
  'tsx': 'ts',
  'html': 'html',
  'css': 'css',
  'scss': 'css'
};

/**
 * Función sincrónica para encontrar componentes de Angular
 */
function findAngularComponentsSync(rootDir) {
  const result = [];
  
  // Esta es una versión simplificada que directamente lista los componentes principales
  // En un entorno real, esto usaría un recorrido recursivo
  
  const mainComponents = [
    'app.component.ts',
    'app.component.html',
    'notification-bell.component.ts',
    'notification-bell.component.html',
    'main-layout.component.ts',
    'notification.service.ts',
    'auth.service.ts',
    'ticket.service.ts'
  ];
  
  mainComponents.forEach(component => {
    result.push(path.join(rootDir, component));
  });
  
  return result;
}

/**
 * Verifica si un archivo ya tiene aviso de copyright
 */
async function hasCopyrightNotice(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.includes('Copyright (c)') && content.includes('Diego Sánchez');
  } catch (error) {
    return false; // Si no podemos leer el archivo, asumimos que no tiene copyright
  }
}

/**
 * Añade aviso de copyright a un archivo si no lo tiene ya
 */
async function addCopyrightToFile(filePath) {
  try {
    // Verificar si el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      console.log(`⚠️ Archivo no encontrado: ${filePath}`);
      return false;
    }
    
    // Verificar si ya tiene copyright
    if (await hasCopyrightNotice(filePath)) {
      console.log(`✓ Ya tiene copyright: ${filePath}`);
      return false;
    }
    
    // Determinar la extensión del archivo
    const ext = path.extname(filePath).substring(1).toLowerCase();
    const mappedExt = EXT_MAP[ext];
    
    if (!mappedExt || !COPYRIGHT_NOTICES[mappedExt]) {
      console.log(`⚠️ Extensión no soportada: ${filePath}`);
      return false;
    }
    
    // Leer el contenido del archivo
    const content = await fs.readFile(filePath, 'utf8');
    
    // Añadir aviso de copyright
    const notice = COPYRIGHT_NOTICES[mappedExt];
    
    // Manejar la línea de filepath que comienza muchos archivos
    if (content.startsWith('// filepath:') || content.startsWith('<!-- filepath:')) {
      // Extraer la primera línea
      const lines = content.split('\n');
      const firstLine = lines[0];
      const restOfContent = lines.slice(1).join('\n');
      
      // Escribir el archivo con el aviso después de la primera línea
      await fs.writeFile(filePath, firstLine + '\n' + notice + restOfContent, 'utf8');
    } else {
      // Escribir el archivo con el aviso al principio
      await fs.writeFile(filePath, notice + content, 'utf8');
    }
    
    console.log(`✓ Copyright añadido: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error procesando archivo ${filePath}:`, error);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  const startTime = Date.now();
  let processed = 0;
  let modified = 0;
  
  console.log('Iniciando proceso de añadir avisos de copyright a archivos importantes...');
  console.log(`Total de archivos a procesar: ${importantFiles.length}`);
  
  try {
    for (const filePath of importantFiles) {
      processed++;
      const wasModified = await addCopyrightToFile(filePath);
      if (wasModified) modified++;
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('----------------------------------------');
    console.log('Proceso completado:');
    console.log(`Archivos procesados: ${processed}`);
    console.log(`Archivos modificados: ${modified}`);
    console.log(`Archivos sin cambios: ${processed - modified}`);
    console.log(`Tiempo de ejecución: ${duration} segundos`);
    console.log('----------------------------------------');
  } catch (error) {
    console.error('Error en el proceso:', error);
    process.exit(1);
  }
}

// Ejecutar la función principal
main().catch(console.error);
