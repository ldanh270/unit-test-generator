#!/usr/bin/env node
/**
 * @file index.ts
 * @description The main executable entry point for the CLI.
 * Bootstraps the application, registers global options, and mounts all available subcommands.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
// unitCommand will be imported and mounted here in Phase 5

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

/**
 * Placeholder for the core 'unit' command.
 * Full implementation will handle AST extraction, LLM API calls, and Self-Healing loops.
 */
const unitCommand = new Command('unit')
  .description('Generate unit tests for a specific file')
  .argument('<file>', 'File path to generate test for')
  .option('-s, --source <dir>', 'Override output test directory')
  .option('-H, --auto-heal', 'Automatically attempt to fix failing tests', false)
  .option('-r, --retries <n>', 'Max retries for self-healing', '3')
  .option('--dry-run', 'Print prompt and LLM response without writing files', false)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action((file, options) => {
    // Stub implementation to be replaced in later phases
    console.log(`[Stub] Running unit test generation for ${file}`);
    console.log('[Stub] Options:', options);
    // TODO: implement Phase 2-5 here
  });

program.addCommand(unitCommand);

// Parse arguments to execute the corresponding action
program.parse(process.argv);
