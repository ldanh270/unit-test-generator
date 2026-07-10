import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

export interface RunResult {
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/** All Jest config file names Jest will auto-detect (in priority order). */
const JEST_CONFIG_NAMES = [
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.ts',
  'jest.config.cts',
];

/**
 * Returns --config <file> args if a jest config exists in projectDir.
 * In ESM projects ("type":"module"), prefers .cjs configs to avoid
 * "module is not defined" errors from module.exports in .js files.
 * Falls back to the first found config if no CJS variant exists.
 */
function detectJestConfigArgs(projectDir: string): string[] {
  const existing = JEST_CONFIG_NAMES.filter(
    (name) => fs.existsSync(path.join(projectDir, name)),
  );
  if (existing.length === 0) return [];

  let chosen = existing[0];

  // In an ESM project, jest.config.js uses module.exports which fails.
  // Prefer .cjs or .cts variants when available.
  let isEsm = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    if (pkg.type === 'module') isEsm = true;
  } catch { /* ignore */ }

  if (isEsm) {
    const cjsPreferred = existing.find((n) => n.endsWith('.cjs') || n.endsWith('.cts'));
    if (cjsPreferred) chosen = cjsPreferred;
  }

  // Always pass --config explicitly to avoid the "Multiple configurations" error
  return ['--config', path.join(projectDir, chosen)];
}

/**
 * Runs Jest on a specific test file.
 * Uses child_process.spawn with a 60s timeout to prevent hanging.
 * 
 * @param testFilePath The path to the test file to run.
 * @param cwd The project directory from which to run Jest.
 * @returns A promise resolving to a RunResult.
 */
export async function runJest(testFilePath: string, cwd: string = process.cwd()): Promise<RunResult> {
  return new Promise((resolve) => {
    const configArgs = detectJestConfigArgs(cwd);

    let command = 'npx';
    let args = ['jest', testFilePath, '--no-coverage', '--colors=false', '--forceExit', ...configArgs];

    // Check if Jest exists locally in node_modules
    const localJestPath = path.join(cwd, 'node_modules', '.bin', 'jest');
    const localJestCmdPath = localJestPath + '.cmd';

    if (process.platform === 'win32' && fs.existsSync(localJestCmdPath)) {
      command = localJestCmdPath;
      args = [testFilePath, '--no-coverage', '--colors=false', '--forceExit', ...configArgs];
    } else if (fs.existsSync(localJestPath)) {
      command = localJestPath;
      args = [testFilePath, '--no-coverage', '--colors=false', '--forceExit', ...configArgs];
    } else {
      logger.warn('Jest not found in node_modules/.bin/jest, running with npx jest (slower)');
      // On Windows, npx needs to be npx.cmd
      if (process.platform === 'win32') {
        command = 'npx.cmd';
      }
    }

    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 60-second timeout
    const timeoutId = setTimeout(() => {
      child.kill();
      resolve({
        passed: false,
        stdout,
        stderr: 'TIMEOUT: possible real DB connection or infinite loop. Test exceeded 60s.',
        exitCode: null,
      });
    }, 60_000);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        passed: code === 0,
        stdout,
        stderr,
        exitCode: code,
      });
    });
    
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        stdout,
        stderr: `Process execution error: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}
