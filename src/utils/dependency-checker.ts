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
  const cwd = process.cwd();
  switch (pkgManager) {
    case 'pnpm': 
      const isWorkspace = fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'));
      return `pnpm add -D ${isWorkspace ? '-w ' : ''}${depsStr}`;
    case 'yarn': 
      // Yarn 1.x requires -W to add to workspace root, checking for workspaces in package.json
      let isYarnWorkspace = false;
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        if (pkg.workspaces) isYarnWorkspace = true;
      } catch {}
      return `yarn add -D ${isYarnWorkspace ? '-W ' : ''}${depsStr}`;
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
  
  if (missingDeps.length > 0) {
    logger.blank();
    const shouldInstall = await confirm({
      message: `Missing testing dependencies detected: ${chalk.yellow(missingDeps.join(', '))}\n  Do you want to automatically install them now?`,
      default: true,
    });

    if (shouldInstall) {
      const pkgManager = detectPackageManager();
      const cmd = getInstallCommand(pkgManager, missingDeps);
      const spinner = ora(`Installing dependencies using ${pkgManager}...`).start();
      
      try {
        // using stdio 'pipe' so we can capture and print the error if it fails
        execSync(cmd, { stdio: 'pipe', cwd: process.cwd() });
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
      } catch (err: any) {
        spinner.fail(`Failed to install dependencies.`);
        logger.error(err.stderr ? err.stderr.toString() : err.message);
        logger.hint(`You can try running \`${cmd}\` manually.`);
      }
    } else {
      logger.info('Skipping installation. Please ensure you install them later.');
    }
  }

  // Generate jest.config.js for TS if missing (even if dependencies were already installed)
  if (isTypeScriptProject()) {
    let isEsm = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      if (pkg.type === 'module') isEsm = true;
    } catch {}

    const configFileName = isEsm ? 'jest.config.cjs' : 'jest.config.js';
    const configPath = path.join(process.cwd(), configFileName);
    const jestTsConfig = path.join(process.cwd(), 'jest.config.ts');
    
    if (!fs.existsSync(configPath) && !fs.existsSync(jestTsConfig)) {
      logger.blank();
      const shouldCreateConfig = await confirm({
        message: `Missing ${configFileName} for TypeScript project. Do you want to auto-create a standard one?`,
        default: true,
      });

      if (shouldCreateConfig) {
        const configContent = `/** @type {import('ts-jest').JestConfigWithTsJest} */\nmodule.exports = {\n  preset: 'ts-jest',\n  testEnvironment: 'node',\n};\n`;
        fs.writeFileSync(configPath, configContent);
        logger.success(`Created standard ${configFileName} for TypeScript`);
      } else {
        logger.info(`Skipping ${configFileName} creation. Tests may fail if Jest is not configured properly.`);
      }
    }
  }
}
