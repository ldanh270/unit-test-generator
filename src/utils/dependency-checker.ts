import fs from 'fs';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { logger } from './logger.js';

export function isTypeScriptProject(projectDir: string): boolean {
  if (fs.existsSync(path.join(projectDir, 'tsconfig.json'))) return true;
  
  const packageJsonPath = path.join(projectDir, 'package.json');
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

export function checkMissingDependencies(projectDir: string): string[] {
  const requiredDeps = ['jest', 'supertest'];
  if (isTypeScriptProject(projectDir)) {
    // If it's a TS project, ts-jest is highly recommended for running Jest without Babel
    requiredDeps.push('@types/jest', '@types/supertest', '@types/node', 'ts-jest');
  }
  
  const missingDeps: string[] = [];
  const packageJsonPath = path.join(projectDir, 'package.json');
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

export function detectPackageManager(projectDir: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(projectDir, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function getInstallCommand(pkgManager: 'npm' | 'pnpm' | 'yarn' | 'bun', deps: string[], projectDir: string): string {
  const depsStr = deps.join(' ');
  switch (pkgManager) {
    case 'pnpm': {
      const isWorkspace = fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'));
      return `pnpm add -D ${isWorkspace ? '-w ' : ''}${depsStr}`;
    }
    case 'yarn': {
      // Yarn 1.x requires -W to add to workspace root, checking for workspaces in package.json
      let isYarnWorkspace = false;
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
        if (pkg.workspaces) isYarnWorkspace = true;
      } catch {}
      return `yarn add -D ${isYarnWorkspace ? '-W ' : ''}${depsStr}`;
    }
    case 'bun': return `bun add -d ${depsStr}`;
    default: return `npm install -D ${depsStr}`;
  }
}

/**
 * Checks for missing dependencies and prompts the user to automatically install them.
 * Also automatically configures jest.config.js for TypeScript projects if needed.
 * 
 * @param projectDir - The root directory of the TARGET project (where package.json lives).
 */
export async function ensureDependencies(projectDir: string): Promise<void> {
  const missingDeps = checkMissingDependencies(projectDir);
  
  if (missingDeps.length > 0) {
    logger.blank();
    const shouldInstall = await confirm({
      message: `Missing testing dependencies detected: ${chalk.yellow(missingDeps.join(', '))}\n  Do you want to automatically install them now?`,
      default: true,
    });

    if (shouldInstall) {
      const pkgManager = detectPackageManager(projectDir);
      const cmd = getInstallCommand(pkgManager, missingDeps, projectDir);
      const spinner = ora(`Installing dependencies using ${pkgManager}...`).start();
      
      try {
        // using stdio 'pipe' so we can capture and print the error if it fails
        execSync(cmd, { stdio: 'pipe', cwd: projectDir });
        spinner.succeed(`Dependencies installed successfully via ${pkgManager}!`);
        
        // Add test script if missing
        const packageJsonPath = path.join(projectDir, 'package.json');
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
        logger.hint(`You can try running \`${cmd}\` manually in ${projectDir}.`);
      }
    } else {
      logger.info('Skipping installation. Please ensure you install them later.');
    }
  }

  // Generate jest config for TS if missing (even if dependencies were already installed)
  if (isTypeScriptProject(projectDir)) {
    let isEsm = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
      if (pkg.type === 'module') isEsm = true;
    } catch {}

    // Check ALL possible jest config file names to avoid the
    // "Multiple configurations found" conflict that occurs when
    // the project already has jest.config.js and we'd create jest.config.cjs.
    const ALL_JEST_CONFIG_NAMES = [
      'jest.config.js',
      'jest.config.cjs',
      'jest.config.mjs',
      'jest.config.ts',
      'jest.config.cts',
    ];
    const existingConfig = ALL_JEST_CONFIG_NAMES.find(
      (name) => fs.existsSync(path.join(projectDir, name)),
    );

    if (existingConfig) {
      logger.hint(`Found existing Jest config: ${existingConfig} — skipping auto-creation.`);

      // If more than one config file exists Jest will crash with
      // "Multiple configurations found". Fix this by making the test script
      // in package.json explicitly select the primary config with --config,
      // so Jest ignores the others.
      const allExistingConfigs = ALL_JEST_CONFIG_NAMES.filter(
        (name) => fs.existsSync(path.join(projectDir, name)),
      );
      if (allExistingConfigs.length > 1) {
        logger.warn(
          `Multiple Jest configs detected: ${allExistingConfigs.join(', ')}. ` +
          `Updating package.json to use --config ${existingConfig} explicitly.`,
        );
        reconcileJestTestScript(existingConfig, projectDir);
      }

    } else {
      const configFileName = isEsm ? 'jest.config.cjs' : 'jest.config.js';
      const configPath = path.join(projectDir, configFileName);

      logger.blank();
      const shouldCreateConfig = await confirm({
        message: `No Jest config found for TypeScript project. Auto-create ${configFileName}?`,
        default: true,
      });

      if (shouldCreateConfig) {
        const configContent = `/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',${isEsm
    ? `\n  extensionsToTreatAsEsm: ['.ts'],\n  transform: {\n    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],\n  },`
    : ''
  }
};
`;
        fs.writeFileSync(configPath, configContent);
        logger.success(`Created standard ${configFileName} for TypeScript`);
      } else {
        logger.info(`Skipping ${configFileName} creation. Tests may fail if Jest is not configured properly.`);
      }
    }

    // Ensure tsconfig.json includes both test and Node runtime ambient types.
    ensureJestTypesInTsConfig(projectDir);
  }
}

/**
 * Patches tsconfig.json to add "jest" and "node" to compilerOptions.types so
 * generated tests and imported backend source recognise Jest globals plus Node
 * APIs such as `process`, `Buffer`, `crypto`, and `fs`.
 *
 * Only modifies the file if:
 *  - tsconfig.json exists in projectDir
 *  - either required ambient type is absent
 */
export function ensureJestTypesInTsConfig(projectDir: string): void {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;

  let raw: string;
  try {
    raw = fs.readFileSync(tsconfigPath, 'utf8');
  } catch {
    return;
  }

  let tsconfig: any;
  try {
    // Strip single-line comments so JSON.parse doesn't choke on tsconfig's
    // common // comment style.
    const stripped = raw.replace(/\/\/[^\n]*/g, '');
    tsconfig = JSON.parse(stripped);
  } catch {
    logger.warn('Could not parse tsconfig.json — skipping jest types injection.');
    return;
  }

  tsconfig.compilerOptions = tsconfig.compilerOptions || {};
  const types: string[] = Array.isArray(tsconfig.compilerOptions.types)
    ? tsconfig.compilerOptions.types
    : [];
  const requiredTypes = ['jest', 'node'];
  const missingTypes = requiredTypes.filter((type) => !types.includes(type));

  if (missingTypes.length === 0) return;

  tsconfig.compilerOptions.types = [...types, ...missingTypes];

  try {
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf8');
    logger.success(`Added ${missingTypes.map((type) => `"${type}"`).join(', ')} to compilerOptions.types in tsconfig.json`);
  } catch (err: any) {
    logger.warn(`Could not update tsconfig.json: ${err.message}`);
  }
}

/**
 * Updates the "test" script in package.json to explicitly pass `--config <configFile>`
 * to Jest. This is the correct fix when multiple Jest config files coexist in the
 * same directory (e.g. jest.config.js AND jest.config.cjs), which would otherwise
 * cause: "Multiple configurations found. Implicit config resolution does not allow
 * multiple configuration files."
 *
 * Only patches scripts.test if it starts with "jest" and doesn't already have --config.
 */
export function reconcileJestTestScript(primaryConfigFile: string, projectDir: string): void {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return;
  }

  const currentScript: string = pkg?.scripts?.test ?? '';

  // Only touch scripts that start with "jest" and don't already pin a config
  if (!currentScript.startsWith('jest') || currentScript.includes('--config')) return;

  pkg.scripts.test = `jest --config ${primaryConfigFile}`;

  try {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    logger.success(`Updated package.json scripts.test → "jest --config ${primaryConfigFile}"`);
  } catch (err: any) {
    logger.warn(`Could not update package.json: ${err.message}`);
  }
}
