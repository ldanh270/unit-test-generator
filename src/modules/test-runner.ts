import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

export interface RunResult {
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  skipped?: boolean;
  command?: string;
  staticCheckScope?: 'file' | 'project';
  staticCheckTool?: 'eslint' | 'biome' | 'lint' | 'typecheck';
}

export type DiagnosticSource = 'lint' | 'jest' | 'parse';

export interface ValidationResult extends RunResult {
  source: DiagnosticSource;
  lintSkipped: boolean;
  lintIgnored?: boolean;
}

export interface CommandSpec {
  command: string;
  args: string[];
  scope: 'file' | 'project';
  tool: 'eslint' | 'biome' | 'lint' | 'typecheck';
}

type TestRunner = (testFilePath: string, cwd: string) => Promise<RunResult>;

export interface ValidationRunners {
  runLint?: TestRunner;
  runJest?: TestRunner;
}

/** All Jest config file names Jest will auto-detect (in priority order). */
const JEST_CONFIG_NAMES = [
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.ts',
  'jest.config.cts',
];

const PROCESS_TIMEOUT_MS = 60_000;

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

  let isEsm = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    if (pkg.type === 'module') isEsm = true;
  } catch {
    // Ignore malformed/missing package.json and use Jest's normal priority.
  }

  if (isEsm) {
    const cjsPreferred = existing.find((name) => name.endsWith('.cjs') || name.endsWith('.cts'));
    if (cjsPreferred) chosen = cjsPreferred;
  }

  return ['--config', path.join(projectDir, chosen)];
}

function localBinary(projectDir: string, name: string): string | undefined {
  const basePath = path.join(projectDir, 'node_modules', '.bin', name);
  const commandPath = process.platform === 'win32' ? `${basePath}.cmd` : basePath;
  return fs.existsSync(commandPath) ? commandPath : undefined;
}

function readPackageJson(projectDir: string): Record<string, any> | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

function detectPackageManager(projectDir: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (fs.existsSync(path.join(projectDir, 'bun.lockb')) || fs.existsSync(path.join(projectDir, 'bun.lock'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Resolves the target project's lint command without downloading new tools.
 * A local file-aware linter is preferred; package scripts are the fallback.
 */
export function resolveLintCommand(testFilePath: string, projectDir: string): CommandSpec | null {
  const relativeTestPath = path.relative(projectDir, testFilePath) || path.basename(testFilePath);

  const eslint = localBinary(projectDir, 'eslint');
  if (eslint) {
    return { command: eslint, args: [relativeTestPath], scope: 'file', tool: 'eslint' };
  }

  const biome = localBinary(projectDir, 'biome');
  if (biome) {
    return { command: biome, args: ['check', relativeTestPath], scope: 'file', tool: 'biome' };
  }

  const pkg = readPackageJson(projectDir);
  const scriptName = pkg?.scripts?.lint
    ? 'lint'
    : pkg?.scripts?.typecheck
      ? 'typecheck'
      : null;
  if (!scriptName) return null;

  const packageManager = detectPackageManager(projectDir);
  const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;

  // Run the project's script exactly as declared. Appending a file breaks valid
  // scripts such as `tsc --noEmit`; direct ESLint/Biome paths above stay file-scoped.
  return {
    command: executable,
    args: ['run', scriptName],
    scope: 'project',
    tool: scriptName,
  };
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMessage: string,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill();
      finish({
        passed: false,
        stdout,
        stderr: [stderr, timeoutMessage].filter(Boolean).join('\n'),
        exitCode: null,
        command: [command, ...args].join(' '),
      });
    }, PROCESS_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      finish({
        passed: code === 0,
        stdout,
        stderr,
        exitCode: code,
        command: [command, ...args].join(' '),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      finish({
        passed: false,
        stdout,
        stderr: [stderr, `Process execution error: ${err.message}`].filter(Boolean).join('\n'),
        exitCode: 1,
        command: [command, ...args].join(' '),
      });
    });
  });
}

/** Runs the target project's linter against the generated test when possible. */
export async function runLint(
  testFilePath: string,
  cwd: string = process.cwd(),
): Promise<RunResult> {
  const lintCommand = resolveLintCommand(testFilePath, cwd);
  if (!lintCommand) {
    return {
      passed: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      skipped: true,
    };
  }

  logger.info(`[Validation] Running ${lintCommand.tool}: ${lintCommand.command} ${lintCommand.args.join(' ')}`);
  const result = await runProcess(
    lintCommand.command,
    lintCommand.args,
    cwd,
    'TIMEOUT: lint exceeded 60s.',
  );
  if (result.passed) {
    logger.success(`[Validation] ${lintCommand.tool} passed.`);
  } else {
    logger.warn(`[Validation] ${lintCommand.tool} exited with code ${String(result.exitCode)}.`);
  }
  return {
    ...result,
    staticCheckScope: lintCommand.scope,
    staticCheckTool: lintCommand.tool,
  };
}

function normalizeDiagnosticPath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

/**
 * Project-wide scripts may fail because of unrelated legacy files. Only feed
 * their output to the repair loop when it names the generated test file.
 */
export function isStaticCheckFailureRelevant(
  result: RunResult,
  testFilePath: string,
  cwd: string,
): boolean {
  if (result.passed || result.staticCheckScope !== 'project') return true;

  const output = normalizeDiagnosticPath(`${result.stderr}\n${result.stdout}`);
  const resolvedTestFile = path.isAbsolute(testFilePath)
    ? testFilePath
    : path.resolve(cwd, testFilePath);
  const absolutePath = normalizeDiagnosticPath(resolvedTestFile);
  const relativePath = normalizeDiagnosticPath(path.relative(cwd, resolvedTestFile));

  return output.includes(absolutePath) || output.includes(relativePath);
}

/**
 * Runs Jest on a specific test file.
 * Uses child_process.spawn with a 60s timeout to prevent hanging.
 */
export async function runJest(
  testFilePath: string,
  cwd: string = process.cwd(),
): Promise<RunResult> {
  const configArgs = detectJestConfigArgs(cwd);

  let command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let args = ['jest', testFilePath, '--runInBand', '--no-coverage', '--colors=false', '--forceExit', ...configArgs];

  const localJest = localBinary(cwd, 'jest');
  if (localJest) {
    command = localJest;
    args = [testFilePath, '--runInBand', '--no-coverage', '--colors=false', '--forceExit', ...configArgs];
  } else {
    logger.warn('Jest not found in node_modules/.bin/jest, running with npx jest (slower)');
  }

  logger.info(`[Validation] Running Jest for ${path.relative(cwd, testFilePath)}...`);
  const result = await runProcess(
    command,
    args,
    cwd,
    'TIMEOUT: possible real DB connection or infinite loop. Test exceeded 60s.',
  );
  if (result.passed) {
    logger.success('[Validation] Jest passed.');
  } else {
    logger.warn(`[Validation] Jest exited with code ${String(result.exitCode)}.`);
  }
  return result;
}

/**
 * Validates a generated test with lint first and Jest second. A failing lint
 * result is returned immediately so the next heal attempt receives that output.
 */
export async function validateTestFile(
  testFilePath: string,
  cwd: string = process.cwd(),
  runners: ValidationRunners = {},
): Promise<ValidationResult> {
  const lintRunner = runners.runLint ?? runLint;
  const jestRunner = runners.runJest ?? runJest;

  const lintResult = await lintRunner(testFilePath, cwd);
  const lintSkipped = lintResult.skipped === true;
  const lintIgnored = !lintSkipped
    && !lintResult.passed
    && !isStaticCheckFailureRelevant(lintResult, testFilePath, cwd);

  if (!lintSkipped && !lintResult.passed && !lintIgnored) {
    return { ...lintResult, source: 'lint', lintSkipped, lintIgnored: false };
  }

  if (lintIgnored) {
    const tool = lintResult.staticCheckTool ?? 'static check';
    logger.warn(
      `Project-wide ${tool} failed only in files unrelated to ${path.relative(cwd, testFilePath)}; continuing with Jest for the generated test.`,
    );
  }

  const jestResult = await jestRunner(testFilePath, cwd);
  return { ...jestResult, source: 'jest', lintSkipped, lintIgnored };
}

/** Keeps stderr and stdout together so the repair prompt never loses either stream. */
export function formatRunOutput(result: RunResult): string {
  const sections: string[] = [];
  if (result.stderr.trim()) sections.push(`=== STDERR ===\n${result.stderr.trim()}`);
  if (result.stdout.trim()) sections.push(`=== STDOUT ===\n${result.stdout.trim()}`);
  return sections.join('\n\n') || 'Unknown error (runner produced no output)';
}
