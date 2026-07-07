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

/**
 * Runs Jest on a specific test file.
 * Uses child_process.spawn with a 60s timeout to prevent hanging.
 * 
 * @param testFilePath The path to the test file to run.
 * @param cwd The working directory from which to run Jest.
 * @returns A promise resolving to a RunResult.
 */
export async function runJest(testFilePath: string, cwd: string = process.cwd()): Promise<RunResult> {
  return new Promise((resolve) => {
    let command = 'npx';
    let args = ['jest', testFilePath, '--no-coverage', '--colors=false', '--forceExit'];

    // Check if Jest exists locally in node_modules
    const localJestPath = path.join(cwd, 'node_modules', '.bin', 'jest');
    const localJestCmdPath = localJestPath + '.cmd';

    if (process.platform === 'win32' && fs.existsSync(localJestCmdPath)) {
      command = localJestCmdPath;
      args = [testFilePath, '--no-coverage', '--colors=false', '--forceExit'];
    } else if (fs.existsSync(localJestPath)) {
      command = localJestPath;
      args = [testFilePath, '--no-coverage', '--colors=false', '--forceExit'];
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
