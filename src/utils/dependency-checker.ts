import fs from 'fs';
import path from 'path';

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
