/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Script para añadir automáticamente avisos de copyright a los archivos del proyecto.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Promisificar funciones del sistema de archivos
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const stat = util.promisify(fs.stat);

// Directorios a excluir
const EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'uploads',
  'temp'
];

// Extensiones de archivo y sus correspondientes avisos de copyright
const COPYRIGHT_NOTICES = {
  js: `/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
  PresenTickets - Sistema de Gestión de Tickets de Soporte
  Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
  
  Este archivo es parte de PresenTickets, un sistema de gestión de tickets
  desarrollado como iniciativa personal por Diego Sánchez.
  
  Uso autorizado únicamente según los términos del acuerdo de licencia.  Este software es propiedad intelectual de Diego Sánchez y su uso en 
  Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
  
  Está prohibida la redistribución, modificación o uso no autorizado
  de este código sin el consentimiento expreso por escrito del autor.
-->

`,

  css: `/*
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
  
  scss: `/*
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
  
  sql: `/*
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
};

// Extensiones mapeadas
const EXT_MAP = {
  'js': 'js',
  'ts': 'ts',
  'jsx': 'js',
  'tsx': 'ts',
  'html': 'html',
  'css': 'css',
  'scss': 'scss',
  'less': 'css',
  'sql': 'sql'
};

// Función para verificar si un archivo ya tiene aviso de copyright
async function hasCopyrightNotice(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return content.includes('Copyright (c)') && content.includes('Diego Sánchez');
  } catch (error) {
    console.error(`Error leyendo archivo ${filePath}:`, error);
    return false;
  }
}

// Función para añadir aviso de copyright a un archivo
async function addCopyrightNotice(filePath) {
  try {
    const ext = path.extname(filePath).substring(1).toLowerCase();
    const mappedExt = EXT_MAP[ext];
    
    if (!mappedExt || !COPYRIGHT_NOTICES[mappedExt]) {
      return false; // No hay aviso definido para esta extensión
    }
    
    if (await hasCopyrightNotice(filePath)) {
      return false; // El archivo ya tiene aviso de copyright
    }
    
    const content = await readFile(filePath, 'utf8');
    const notice = COPYRIGHT_NOTICES[mappedExt];
    await writeFile(filePath, notice + content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error procesando archivo ${filePath}:`, error);
    return false;
  }
}

// Función para procesar recursivamente directorios
async function processDirectory(dirPath, results = { processed: 0, modified: 0 }) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Saltear directorios excluidos
      if (entry.isDirectory() && !EXCLUDE_DIRS.includes(entry.name)) {
        await processDirectory(fullPath, results);
      } 
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).substring(1).toLowerCase();
        if (EXT_MAP[ext]) {
          results.processed++;
          const modified = await addCopyrightNotice(fullPath);
          if (modified) {
            console.log(`✓ Aviso de copyright añadido a: ${fullPath}`);
            results.modified++;
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error procesando directorio ${dirPath}:`, error);
    return results;
  }
}

// Función principal
async function main() {
  const startTime = Date.now();
  console.log('Iniciando proceso de añadir avisos de copyright...');
  
  // Determinar el directorio a procesar (usar el primer argumento de línea de comandos o el directorio actual)
  const targetDir = process.argv[2] || process.cwd();
  console.log(`Procesando directorio: ${targetDir}`);
  
  try {
    const stats = await stat(targetDir);
    if (!stats.isDirectory()) {
      console.error('La ruta especificada no es un directorio válido.');
      process.exit(1);
    }
    
    const results = await processDirectory(targetDir);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('----------------------------------------');
    console.log('Proceso completado:');
    console.log(`Archivos procesados: ${results.processed}`);
    console.log(`Archivos modificados: ${results.modified}`);
    console.log(`Archivos sin cambios: ${results.processed - results.modified}`);
    console.log(`Tiempo de ejecución: ${duration} segundos`);
    console.log('----------------------------------------');
  } catch (error) {
    console.error('Error en el proceso:', error);
    process.exit(1);
  }
}

// Ejecutar la función principal
main().catch(console.error);
