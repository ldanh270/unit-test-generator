import fs from 'fs';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { logger } from './logger.js';

export function isTypeScriptProject(): boolean {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) return true;
  
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps['typescript']) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function checkMissingDependencies(): string[] {
  const requiredDeps = ['jest', 'supertest'];
  if (isTypeScriptProject()) {
    // If it's a TS project, ts-jest is highly recommended for running Jest without Babel
    requiredDeps.push('@types/jest', '@types/supertest', 'ts-jest');
  }
  
  const missingDeps: string[] = [];
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) return requiredDeps;
  
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const dep of requiredDeps) {
      if (!allDeps[dep]) missingDeps.push(dep);
    }
  } catch {
    return requiredDeps;
  }
  
  return missingDeps;
}

export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

export function getInstallCommand(pkgManager: 'npm' | 'pnpm' | 'yarn' | 'bun', deps: string[]): string {
  const depsStr = deps.join(' ');
  switch (pkgManager) {
    case 'pnpm': return `pnpm add -D ${depsStr}`;
    case 'yarn': return `yarn add -D ${depsStr}`;
    case 'bun': return `bun add -d ${depsStr}`;
    default: return `npm install -D ${depsStr}`;
  }
}

/**
 * Checks for missing dependencies and prompts the user to automatically install them.
 * Also automatically configures jest.config.js for TypeScript projects if needed.
 */
export async function ensureDependencies(): Promise<void> {
  const missingDeps = checkMissingDependencies();
  if (missingDeps.length === 0) return;

  logger.blank();
  const shouldInstall = await confirm({
    message: `Missing testing dependencies detected: ${chalk.yellow(missingDeps.join(', '))}\n  Do you want to automatically install them now?`,
    default: true,
  });

  if (!shouldInstall) {
    logger.info('Skipping installation. Please ensure you install them later.');
    return;
  }

  const pkgManager = detectPackageManager();
  const cmd = getInstallCommand(pkgManager, missingDeps);
  const spinner = ora(`Installing dependencies using ${pkgManager}...`).start();
  
  try {
    execSync(cmd, { stdio: 'ignore', cwd: process.cwd() });
    spinner.succeed(`Dependencies installed successfully via ${pkgManager}!`);
    
    // Add test script if missing
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      if (!pkg.scripts.test) {
         pkg.scripts.test = "jest";
         fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
         logger.success('Added "test": "jest" script to package.json');
      }
    }

    // Generate jest.config.js for TS if missing
    if (isTypeScriptProject()) {
      const jestJsConfig = path.join(process.cwd(), 'jest.config.js');
      const jestTsConfig = path.join(process.cwd(), 'jest.config.ts');
      
      if (!fs.existsSync(jestJsConfig) && !fs.existsSync(jestTsConfig)) {
        const configContent = `/** @type {import('ts-jest').JestConfigWithTsJest} */\nmodule.exports = {\n  preset: 'ts-jest',\n  testEnvironment: 'node',\n};\n`;
        fs.writeFileSync(jestJsConfig, configContent);
        logger.success('Created standard jest.config.js for TypeScript');
      }
    }
  } catch (err) {
    spinner.fail(`Failed to install dependencies. You can run \`${cmd}\` manually.`);
  }
}
