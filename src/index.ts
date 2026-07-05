
/**
 * @file index.ts
 * @description The main executable entry point for the CLI.
 * Bootstraps the application, registers global options, and mounts all available subcommands.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { unitCommand } from './commands/unit.js';

/**
 * Initialize the root Command instance
 */
const program = new Command();

program
  .name('test-gen')
  .description('AI-powered unit test generator for Express.js')
  .version('0.1.0');

// Mount the initialization wizard
program.addCommand(initCommand);
program.addCommand(unitCommand);

// Parse arguments to execute the corresponding action
program.parse(process.argv);
