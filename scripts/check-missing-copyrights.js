#!/usr/bin/env node
/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Script para verificar archivos sin avisos de copyright
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Promisificar funciones del sistema de archivos
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
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

// Extensiones de archivo a verificar
const FILE_EXTENSIONS = [
  'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'sql'
];

// Verifica si un archivo ya tiene aviso de copyright
async function hasCopyrightNotice(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return content.includes('Copyright (c)') && content.includes('Diego Sánchez');
  } catch (error) {
    console.error(`Error leyendo archivo ${filePath}:`, error);
    return false;
  }
}

// Recorre recursivamente directorios y archivos
async function traverseDirectory(dirPath) {
  let filesProcessed = 0;
  let filesMissingCopyright = [];
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const entryStat = await stat(fullPath);
      
      // Excluir directorios especificados
      if (entryStat.isDirectory() && !EXCLUDE_DIRS.includes(entry)) {
        const subResults = await traverseDirectory(fullPath);
        filesProcessed += subResults.filesProcessed;
        filesMissingCopyright = filesMissingCopyright.concat(subResults.filesMissingCopyright);
      } else if (entryStat.isFile()) {
        const ext = path.extname(fullPath).substring(1).toLowerCase();
        
        // Solo procesar archivos con extensiones relevantes
        if (FILE_EXTENSIONS.includes(ext)) {
          filesProcessed++;
          const hasCopyright = await hasCopyrightNotice(fullPath);
          if (!hasCopyright) {
            filesMissingCopyright.push(fullPath);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error recorriendo directorio ${dirPath}:`, error);
  }
  
  return { filesProcessed, filesMissingCopyright };
}

// Función principal
async function main() {
  console.log(`Iniciando verificación de avisos de copyright...`);
  
  const startTime = Date.now();
  
  // Si se pasa un directorio específico como argumento, usar ese
  const targetDir = process.argv[2] || process.cwd();
  
  console.log(`Procesando directorio: ${targetDir}`);
  
  const results = await traverseDirectory(targetDir);
  
  const endTime = Date.now();
  const executionTime = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('----------------------------------------');
  console.log('Verificación completa:');
  console.log(`Archivos procesados: ${results.filesProcessed}`);
  console.log(`Archivos sin aviso de copyright: ${results.filesMissingCopyright.length}`);
  console.log(`Tiempo de ejecución: ${executionTime} segundos`);
  console.log('----------------------------------------');
  
  if (results.filesMissingCopyright.length > 0) {
    console.log('Archivos que requieren avisos de copyright:');
    results.filesMissingCopyright.forEach(file => {
      console.log(`- ${file}`);
    });
    console.log('----------------------------------------');
    console.log('Ejecute el siguiente comando para añadir avisos de copyright:');
    console.log('node scripts/add-copyright.js');
    console.log('----------------------------------------');
    process.exit(1); // Salir con error si hay archivos sin copyright
  } else {
    console.log('✓ Todos los archivos relevantes tienen avisos de copyright.');
  }
}

// Ejecutar la función principal
main().catch(console.error);
