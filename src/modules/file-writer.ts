import fs from 'fs/promises';
import path from 'path';

export class ParseError extends Error {
  public rawResponse: string;

  constructor(message: string, rawResponse: string = '') {
    super(message);
    this.name = 'ParseError';
    this.rawResponse = rawResponse;
  }
}

/**
 * Calculates the output path for the test file.
 * 
 * Logic:
 * 1. Takes the relative path of the input file from CWD.
 * 2. Strips the root segment up to and including 'src', or just the first segment if 'src' doesn't exist.
 * 3. Joins the rest with `sourceDir` (which is typically resolved from --source or .env).
 * 4. Replaces the extension (.js -> .spec.js, .ts -> .spec.ts).
 */
/**
 * Calculates the output path for the test file.
 * 
 * Logic:
 * 1. Takes the relative path of the input file from projectDir.
 * 2. Strips the root segment up to and including 'src', or just the first segment if 'src' doesn't exist.
 * 3. Joins the rest with `sourceDir` (which is resolved relative to projectDir).
 * 4. Replaces the extension (.js -> .spec.js, .ts -> .spec.ts).
 *
 * @param inputPath    Absolute path to the source file being tested.
 * @param sourceDir    Test output directory (relative or absolute). If relative, resolved from projectDir.
 * @param projectDir   Root directory of the target project.
 */
export function getOutputPath(inputPath: string, sourceDir: string, projectDir: string): string {
  const relativeInputPath = path.relative(projectDir, inputPath);
  
  // Split path into segments using the OS-specific separator
  const segments = relativeInputPath.split(path.sep);
  
  // Find the 'src' directory index, or default to the first segment
  let startIndex = segments.findIndex(seg => seg === 'src');
  if (startIndex === -1) {
    // If no 'src', skip the first folder (e.g., backend/controllers -> controllers)
    if (segments.length > 1) {
      startIndex = 1;
    } else {
      startIndex = 0;
    }
  } else {
    // skip 'src'
    startIndex += 1;
  }
  
  const relevantSegments = segments.slice(startIndex);
  const relevantPath = path.join(...relevantSegments);
  
  const parsedPath = path.parse(relevantPath);
  
  // Replace extension
  let newExt = '.spec' + parsedPath.ext;
  if (!parsedPath.ext) {
     newExt = '.spec.js'; // fallback
  }

  // Resolve sourceDir relative to projectDir if it's not absolute
  const resolvedSourceDir = path.isAbsolute(sourceDir)
    ? sourceDir
    : path.join(projectDir, sourceDir);

  const outputPath = path.join(resolvedSourceDir, parsedPath.dir, parsedPath.name + newExt);
  
  return outputPath;
}

/**
 * Backups the file if it exists by copying it with a timestamp.
 * Returns the path of the backup file, or null if no existing file.
 */
export async function backupIfExists(outputPath: string): Promise<string | null> {
  try {
    await fs.access(outputPath);
  } catch {
    // File does not exist, no need to backup
    return null;
  }

  const parsedPath = path.parse(outputPath);
  
  const date = new Date();
  // Format: 2026-07-05T08-14-00 (strip milliseconds and trailing Z)
  const timestamp = date.toISOString().replace(/\.\d{3}Z$/, '').replace(/[:.]/g, '-');
  
  // Create backup filename WITHOUT source extension so Jest/TS don't try to compile it
  // e.g. holiday.service.spec.2026-07-10T08-14-00.bak  (not .bak.ts)
  const backupFilename = `${parsedPath.name}.${timestamp}.bak`;
  // parsedPath.dir may be empty string for root-level files, so use path.dirname(outputPath)
  const backupPath = path.join(path.dirname(outputPath), backupFilename);
  
  await fs.copyFile(outputPath, backupPath);
  
  return backupPath;
}

/**
 * Extracts the code block from the LLM response.
 * Throws ParseError if no code block is found.
 */
export function extractCodeBlock(llmResponse: string): string {
  // 1. Try javascript/js
  const jsMatch = llmResponse.match(/```(?:javascript|js)\s*([\s\S]*?)\s*```/i);
  if (jsMatch && jsMatch[1]) {
    return jsMatch[1].trim();
  }

  // 2. Try typescript/ts
  const tsMatch = llmResponse.match(/```(?:typescript|ts)\s*([\s\S]*?)\s*```/i);
  if (tsMatch && tsMatch[1]) {
    return tsMatch[1].trim();
  }

  // 3. Try bare code fence
  const bareMatch = llmResponse.match(/```\s*([\s\S]*?)\s*```/);
  if (bareMatch && bareMatch[1]) {
    return bareMatch[1].trim();
  }
  
  // 4. Not found
  throw new ParseError('Code block not found in LLM response', llmResponse);
}

/**
 * Writes an error log (e.g. when LLM fails to generate a code block or self-heal fails).
 */
export async function writeErrorLog(
  sourceDir: string, 
  filename: string, 
  content: string, 
  projectDir: string
): Promise<string> {
  // Resolve sourceDir relative to projectDir if not absolute
  const resolvedSourceDir = path.isAbsolute(sourceDir)
    ? sourceDir
    : path.join(projectDir, sourceDir);
  const errorDir = path.join(resolvedSourceDir, '.test-gen-errors');
  await fs.mkdir(errorDir, { recursive: true });
  
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const errorFilename = `${filename}.${timestamp}.error.log`;
  
  const errorPath = path.join(errorDir, errorFilename);
  await fs.writeFile(errorPath, content, 'utf-8');
  
  return errorPath;
}

/**
 * Writes the code to the output path safely, backing up the existing file if necessary.
 * Also ensures the parent directories exist.
 */
export async function writeFileSafe(outputPath: string, code: string): Promise<string | null> {
  const backupPath = await backupIfExists(outputPath);
  
  // Ensure the directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the new test file
  await fs.writeFile(outputPath, code, 'utf-8');
  
  return backupPath;
}
