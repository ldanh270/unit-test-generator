/**
 * @file init.ts
 * @description The 'init' subcommand module.
 * Acts as a controller that orchestrates the interactive CLI setup wizard,
 * collects configuration data from the user, and delegates file writing to EnvWriter.
 */

import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { EnvWriter, EnvConfig } from '../config/env-writer.js';

import { checkMissingDependencies, detectPackageManager, getInstallCommand } from '../utils/dependency-checker.js';

/**
 * The 'init' subcommand.
 * When executed, it launches an interactive wizard to configure the CLI
 * and writes the preferences to a .env file.
 */
export const initCommand = new Command('init')
  .description('Initialize configuration for test-gen')
  .action(async () => {
    logger.header('test-gen', 'v0.1.0');
    logger.hint('Interactive configuration wizard\n');

    try {
      // 1. Collect configuration through interactive prompts
      const config: EnvConfig = {
        baseUrl: await input({
          message: 'API Base URL (e.g., https://api.openai.com/v1, https://openrouter.ai/api/v1):',
          default: 'https://api.openai.com/v1',
        }),
        apiKey: await input({
          message: 'API Key:',
          validate: (val: string) => val.trim().length > 0 || 'API Key is required.',
        }),
        model: await input({
          message: 'Model Name (e.g., gpt-4o, anthropic/claude-3-5-sonnet):',
          default: 'gpt-4o',
        }),
        sourceDir: await input({
          message: 'Default output directory for tests (e.g., ./src/__tests__):',
          default: './src/__tests__',
        }),
        maxRetries: await input({
          message: 'Max retries for self-healing:',
          default: '3',
        }),
      };

      // 2. Determine file persistence strategy
      const envWriter = new EnvWriter();
      const envExists = await envWriter.checkEnvExists();
      
      let shouldAppend = false;
      if (envExists) {
        logger.blank();
        shouldAppend = await confirm({
          message: '.env file already exists. Append to it?',
          default: true,
        });
      }

      // 3. Persist configuration
      const savedPath = await envWriter.writeConfig(config, shouldAppend);

      // 4. Report success and next steps
      logger.blank();
      if (shouldAppend) {
        logger.success(`Appended configuration to ${chalk.white.bold(savedPath)}`);
      } else {
        logger.success(`Created new configuration at ${chalk.white.bold(savedPath)}`);
      }

      // 5. Check and install missing testing dependencies
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
            execSync(cmd, { stdio: 'ignore', cwd: process.cwd() });
            spinner.succeed(`Dependencies installed successfully via ${pkgManager}!`);
            
            // Try to add test script if missing
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
          } catch (err) {
            spinner.fail(`Failed to install dependencies. You can run \`${cmd}\` manually.`);
          }
        } else {
          logger.info('Skipping installation. Please ensure you install them later.');
        }
      }

      logger.blank();
      logger.nextSteps(['test-gen unit <path-to-file.js>']);
      
    } catch (error: any) {
      // Graceful handling for user cancellations via Ctrl+C during prompts
      if (error.name === 'ExitPromptError') {
        logger.warn('Setup cancelled by user.');
      } else {
        logger.error(error.message || 'An unexpected error occurred.');
      }
      process.exit(1);
    }
  });
