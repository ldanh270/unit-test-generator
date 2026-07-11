import path from 'path';

/**
 * Calculates the relative import path from a test file to a source file.
 * Ensures the path starts with './' or '../' and uses POSIX separators (/) for imports.
 * It also strips the extension (e.g., .ts or .js) since typical imports don't need them.
 * 
 * @param testFilePath Absolute path to the test file
 * @param sourceFilePath Absolute path to the source file
 * @returns The relative import string to be used in the test file
 */
export function getRelativeImportPath(testFilePath: string, sourceFilePath: string): string {
  const testDir = path.dirname(testFilePath);
  let relativePath = path.relative(testDir, sourceFilePath);
  
  // Normalize to POSIX for imports (in case we are running on Windows)
  relativePath = relativePath.split(path.sep).join('/');
  
  // Remove extension for import (e.g., .ts, .js)
  const ext = path.extname(relativePath);
  if (ext) {
    relativePath = relativePath.slice(0, -ext.length);
  }
  
  // Ensure it starts with ./ or ../ for module resolution
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  
  return relativePath;
}
