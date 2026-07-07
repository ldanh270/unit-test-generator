import { confirm } from '@inquirer/prompts';
import fs from 'fs/promises';
import path from 'path';
import { runJest } from './test-runner.js';
import { LLMClient } from '../llm/client.js';
import { buildFixPrompt } from './prompt-builder.js';
import { extractCodeBlock, writeErrorLog, ParseError } from './file-writer.js';
import { logger } from '../utils/logger.js';
import { ChatMessage } from '../types/llm.js';
import { checkMissingDependencies, detectPackageManager, getInstallCommand } from '../utils/dependency-checker.js';

export interface SelfHealOptions {
  testFilePath: string;
  sourceDir: string;
  llmClient: LLMClient;
  systemMessages: ChatMessage[];
  maxRetries: number;
  autoHeal: boolean;
  cwd: string;
}

/**
 * Runs the self-healing loop for a generated test file.
 */
export async function selfHeal(options: SelfHealOptions): Promise<void> {
  const { testFilePath, sourceDir, llmClient, systemMessages, maxRetries, autoHeal, cwd } = options;

  let result = await runJest(testFilePath, cwd);
  if (result.passed) {
    logger.success(`Tests passed successfully for ${testFilePath}`);
    return;
  }

  logger.error(`Tests failed for ${testFilePath}`);
  const errorOutput = result.stderr || result.stdout || '';
  
  // Print a snippet of the error for the user to see
  console.log('\n' + errorOutput.slice(0, 1000) + '\n...');

  // Fast-fail check for environment configuration errors
  const isEnvError = 
    errorOutput.includes('Jest encountered an unexpected token') ||
    errorOutput.includes('Jest failed to parse a file') ||
    errorOutput.includes('Cannot use import statement outside a module') ||
    errorOutput.includes('is not recognized as an internal or external command') ||
    errorOutput.includes('command not found');

  if (isEnvError) {
    logger.error('Environment Configuration Error Detected!');
    logger.warn('Jest failed to parse the test file. This usually means your project is not configured to run TypeScript or ESM tests with Jest.');
    
    const missingDeps = checkMissingDependencies();
    if (missingDeps.length > 0) {
      const pkgManager = detectPackageManager();
      const cmd = getInstallCommand(pkgManager, missingDeps);
      logger.hint(`Missing testing dependencies detected: ${missingDeps.join(', ')}`);
      logger.hint(`Fix: Run \`${cmd}\` in your project and ensure jest.config.js is configured.`);
    } else {
      logger.hint('Fix: Please ensure your jest.config.js is correctly configured for your project.');
    }
    
    logger.info('Self-healing skipped (LLM cannot fix your project environment).');
    process.exit(1);
  }

  if (!autoHeal) {
    const shouldHeal = await confirm({
      message: 'Tests failed. Do you want to auto-fix? (Tip: use --auto-heal to skip this prompt)',
      default: true,
    });

    if (!shouldHeal) {
      logger.info(`Test output left at ${testFilePath}. Exiting.`);
      process.exit(1);
    }
  } else {
    logger.info('Auto-heal is enabled. Attempting to fix...');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info(`\n[Self-Healing] Attempt ${attempt} of ${maxRetries}...`);

    let faultyCode = '';
    try {
      faultyCode = await fs.readFile(testFilePath, 'utf-8');
    } catch (e) {
      logger.error(`Could not read test file for healing: ${String(e)}`);
      process.exit(1);
    }

    let stderrStr = result.stderr || result.stdout || 'Unknown error';

    // Construct the conversation for the LLM
    const conversation: ChatMessage[] = [...systemMessages];
    
    // We add the faulty code as if the assistant just outputted it
    conversation.push({ role: 'assistant', content: faultyCode });
    // And add the fix prompt
    conversation.push(buildFixPrompt(faultyCode, stderrStr, attempt, maxRetries));

    let llmResponse = '';
    try {
      llmResponse = await llmClient.complete(conversation);
    } catch (err) {
      logger.error(`LLM API failed during healing: ${String(err)}`);
      process.exit(1); 
    }

    let fixedCode = '';
    try {
      fixedCode = extractCodeBlock(llmResponse);
    } catch (err) {
      if (err instanceof ParseError) {
        logger.warn('LLM failed to output a valid code block.');
        const errorPath = await writeErrorLog(
          sourceDir,
          path.basename(testFilePath),
          `LLM Response Parse Error\n\nRaw Response:\n${err.rawResponse}`,
          cwd
        );
        logger.hint(`Raw LLM response logged to: ${errorPath}`);
        
        // Force a specific error message for the next iteration so the LLM fixes its formatting
        result = {
          passed: false,
          stdout: '',
          stderr: 'ParseError: You forgot the code fence markers (```javascript ... ```). Please wrap your output in code fences.',
          exitCode: 1,
        };
        continue;
      } else {
        throw err;
      }
    }

    // Overwrite the file with fixed code
    await fs.writeFile(testFilePath, fixedCode, 'utf-8');
    logger.info('File updated with potential fix. Re-running tests...');

    // Run Jest again
    result = await runJest(testFilePath, cwd);
    if (result.passed) {
      logger.success(`Self-healing successful on attempt ${attempt}!`);
      return;
    }

    logger.warn(`Self-healing attempt ${attempt} failed.`);
  }

  // Exhausted all retries
  logger.error('Exhausted all self-healing retries. The test is still failing.');
  const errorPath = await writeErrorLog(
    sourceDir,
    path.basename(testFilePath),
    `Self-Heal Failed after ${maxRetries} retries.\n\nFinal stderr:\n${result.stderr || result.stdout}\n\nFaulty Code:\n${await fs.readFile(testFilePath, 'utf-8')}`,
    cwd
  );
  logger.info(`Detailed error log saved to: ${errorPath}`);
  process.exit(1);
}
