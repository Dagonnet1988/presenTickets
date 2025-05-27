#!/usr/bin/env node
/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Script para actualizar automáticamente el año en los avisos de copyright
 * Este script debe ejecutarse al inicio de cada año.
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

// Actualiza el año en el texto de copyright
function updateCopyrightYear(content) {
  const currentYear = new Date().getFullYear();
  
  // Buscar patrones de años de copyright como "2023-2024" o "2023" y actualizarlos
  const updatedContent = content.replace(
    /Copyright \(c\) (\d{4})(-\d{4})?/g,
    (match, startYear) => `Copyright (c) ${startYear}-${currentYear}`
  );
  
  return updatedContent;
}

// Procesa un archivo para actualizar su aviso de copyright
async function processFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    
    // Verificar si el archivo contiene aviso de copyright
    if (content.includes('Copyright (c)')) {
      const updatedContent = updateCopyrightYear(content);
      
      // Solo escribir si hubo cambios
      if (content !== updatedContent) {
        await writeFile(filePath, updatedContent, 'utf8');
        console.log(`✓ Año de copyright actualizado en: ${filePath}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error procesando archivo ${filePath}:`, error);
    return false;
  }
}

// Recorre recursivamente directorios y archivos
async function traverseDirectory(dirPath) {
  let filesProcessed = 0;
  let filesUpdated = 0;
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const entryStat = await stat(fullPath);
      
      // Excluir directorios especificados
      if (entryStat.isDirectory() && !EXCLUDE_DIRS.includes(entry)) {
        const subResults = await traverseDirectory(fullPath);
        filesProcessed += subResults.filesProcessed;
        filesUpdated += subResults.filesUpdated;
      } else if (entryStat.isFile()) {
        const ext = path.extname(fullPath).substring(1).toLowerCase();
        
        // Solo procesar archivos con extensiones relevantes
        if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'sql'].includes(ext)) {
          filesProcessed++;
          const updated = await processFile(fullPath);
          if (updated) filesUpdated++;
        }
      }
    }
  } catch (error) {
    console.error(`Error recorriendo directorio ${dirPath}:`, error);
  }
  
  return { filesProcessed, filesUpdated };
}

// Función principal
async function main() {
  console.log(`Iniciando actualización de años en avisos de copyright...`);
  console.log(`Año actual: ${new Date().getFullYear()}`);
  
  const startTime = Date.now();
  
  // Si se pasa un directorio específico como argumento, usar ese
  const targetDir = process.argv[2] || process.cwd();
  
  console.log(`Procesando directorio: ${targetDir}`);
  
  const results = await traverseDirectory(targetDir);
  
  const endTime = Date.now();
  const executionTime = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('----------------------------------------');
  console.log('Proceso completado:');
  console.log(`Archivos procesados: ${results.filesProcessed}`);
  console.log(`Archivos actualizados: ${results.filesUpdated}`);
  console.log(`Tiempo de ejecución: ${executionTime} segundos`);
  console.log('----------------------------------------');
}

// Ejecutar la función principal
main().catch(console.error);
