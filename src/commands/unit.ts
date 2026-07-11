import { Command } from 'commander';
import { loadConfig, parseMaxRetries } from '../config.js';
import { extractContext } from '../modules/ast-extractor.js';
import { getRelativeImportPath } from '../modules/path-resolver.js';
import { ensureDependencies } from '../utils/dependency-checker.js';
import { buildGeneratePrompt } from '../modules/prompt-builder.js';
import { LLMClient } from '../llm/client.js';
import { getOutputPath, extractCodeBlock, writeFileSafe } from '../modules/file-writer.js';
import { selfHeal } from '../modules/heal.js';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import path from 'path';
import fs from 'fs';

/**
 * Walk up from `startDir` until we find a directory that contains a package.json.
 * Falls back to `startDir` itself if none found at any level.
 */
function findProjectRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root — fall back to startDir
      return startDir;
    }
    current = parent;
  }
}

export const unitCommand = new Command('unit')
  .description('Generate unit tests for a specific file')
  .argument('<file>', 'File path to generate test for')
  .option('-s, --source <dir>', 'Override output test directory')
  .option('-H, --auto-heal', 'Automatically attempt to fix failing tests', false)
  .option('-r, --retries <n>', 'Max retries for self-healing')
  .option('--dry-run', 'Print prompt and LLM response without writing files', false)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (file, options) => {
    try {
      const cwd = process.cwd();
      
      // 1. Load config
      const config = loadConfig(options.source);
      if (!config.sourceDir) {
        throw new Error('No output directory set. Run `aatest init` or use the `--source` flag.');
      }
      
      // 1.5 Resolve target project root and ensure its environment is setup properly
      const filePath = path.resolve(cwd, file);
      const targetProjectDir = findProjectRoot(path.dirname(filePath));
      logger.hint(`Target project root: ${targetProjectDir}`);
      await ensureDependencies(targetProjectDir);
      
      const maxRetries = options.retries === undefined
        ? config.maxRetries
        : parseMaxRetries(options.retries, '--retries');
      const maxRetriesSource = options.retries === undefined ? config.maxRetriesSource : '--retries';
      logger.hint(`Self-healing retries: ${maxRetries} (from ${maxRetriesSource})`);

      logger.header('Test-Gen', 'Generating Unit Tests');
      
      // 2. AST Extract & Path Resolution
      const spinner = ora('Analyzing source file...').start();
      const context = await extractContext(filePath);
      
      const outputPath = getOutputPath(filePath, config.sourceDir, targetProjectDir);
      context.testFilePath = outputPath;
      context.relativeImportPath = getRelativeImportPath(outputPath, filePath);
      
      spinner.succeed('Source file analyzed & paths resolved');
      
      // 3. Validate exports
      if (context.exports.length === 0) {
        const proceed = await confirm({
          message: 'No exports found in this file. Do you still want to generate tests?',
          default: false,
        });
        if (!proceed) {
          logger.info('Aborted by user.');
          process.exit(0);
        }
      }

      // 4. Build Prompt
      const messages = buildGeneratePrompt(context);
      
      // 5. Call LLM
      spinner.start('Generating test code with LLM...');
      const llmClient = new LLMClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        verbose: options.verbose,
      });
      
      const llmResponse = await llmClient.complete(messages);
      spinner.succeed('Test code generated');
      
      // Dry run handling
      if (options.dryRun) {
        logger.info('\n--- DRY RUN: SYSTEM PROMPT ---');
        console.log(messages[0].content);
        logger.info('\n--- DRY RUN: USER PROMPT ---');
        console.log(messages[1].content);
        logger.info('\n--- DRY RUN: LLM RESPONSE ---');
        console.log(llmResponse);
        return;
      }

      // 6. Extract Code Block
      let testCode = extractCodeBlock(llmResponse);

      // Defensive: for TypeScript test files, always ensure the jest triple-slash
      // reference is the very first line so TypeScript recognises jest globals.
      // This guards against the LLM forgetting rule 8 in the system prompt.
      if (outputPath.endsWith('.ts') && !testCode.startsWith('/// <reference types="jest" />')) {
        testCode = '/// <reference types="jest" />\n' + testCode;
      }
      
      // 8. Write File & Backup
      spinner.start('Writing file...');
      const backupPath = await writeFileSafe(outputPath, testCode);
      spinner.succeed('Test file written to ' + outputPath);
      if (backupPath) {
        logger.hint(`Previous test file backed up to ${backupPath}`);
      }

      // 9. Self Heal — run Jest in the TARGET project directory
      await selfHeal({
        testFilePath: outputPath,
        sourceDir: config.sourceDir,
        llmClient,
        systemMessages: messages,
        maxRetries,
        autoHeal: options.autoHeal,
        cwd: targetProjectDir,
      });

    } catch (err: any) {
      logger.error(err.message);
      if (options.verbose && err.stack) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });
