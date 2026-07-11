import { confirm } from '@inquirer/prompts';
import fs from 'fs/promises';
import path from 'path';
import {
  formatRunOutput,
  validateTestFile,
  ValidationResult,
} from './test-runner.js';
import { LLMClient } from '../llm/client.js';
import {
  buildAnalyzePrompt,
  buildFixPrompt,
  RepairLanguage,
} from './prompt-builder.js';
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

type TestValidator = (testFilePath: string, cwd: string) => Promise<ValidationResult>;

export interface SelfHealDependencies {
  validate?: TestValidator;
}

function repairLanguage(testFilePath: string): RepairLanguage {
  return /\.(?:ts|tsx)$/i.test(testFilePath) ? 'typescript' : 'javascript';
}

function diagnosticName(result: ValidationResult): string {
  if (result.source === 'lint') return 'Lint';
  if (result.source === 'parse') return 'LLM response parsing';
  return 'Jest';
}

function ensureTypeScriptJestReference(code: string, testFilePath: string): string {
  if (!/\.(?:ts|tsx)$/i.test(testFilePath)) return code;
  if (code.startsWith('/// <reference types="jest" />')) return code;
  return `/// <reference types="jest" />\n${code}`;
}

function stopIfPassed(
  result: ValidationResult,
  testFilePath: string,
  attempt?: number,
): boolean {
  if (!result.passed) return false;

  const validationSummary = result.lintSkipped
    ? 'Tests passed (lint unavailable)'
    : result.lintIgnored
      ? 'Tests passed (unrelated project-wide static errors ignored)'
      : 'Lint and tests passed';
  const attemptSummary = attempt === undefined
    ? ''
    : ` on attempt ${attempt}; stopping early with ${attempt} of the allowed retries used`;
  logger.success(`${validationSummary}${attemptSummary} for ${testFilePath}`);
  return true;
}

/**
 * Runs the generated file through lint -> Jest, diagnoses each failure, then
 * asks the LLM for a repair. The validation output from one attempt becomes
 * the diagnostic input for the next attempt.
 */
export async function selfHeal(
  options: SelfHealOptions,
  dependencies: SelfHealDependencies = {},
): Promise<void> {
  const { testFilePath, sourceDir, llmClient, systemMessages, maxRetries, autoHeal, cwd } = options;
  const validate = dependencies.validate ?? validateTestFile;

  let result = await validate(testFilePath, cwd);
  if (result.lintSkipped) {
    logger.warn('No local ESLint/Biome binary or package.json lint script found; lint validation was skipped.');
  }

  if (stopIfPassed(result, testFilePath)) return;

  logger.error(`${diagnosticName(result)} validation failed for ${testFilePath}`);
  const initialErrorOutput = formatRunOutput(result);

  // Print a snippet of the error for the user to see.
  console.log('\n' + initialErrorOutput.slice(0, 1000) + '\n...');

  // These failures require project configuration changes rather than generated-code repairs.
  const isEnvError = result.source === 'jest' && (
    initialErrorOutput.includes('Jest encountered an unexpected token') ||
    initialErrorOutput.includes('Jest failed to parse a file') ||
    initialErrorOutput.includes('Cannot use import statement outside a module') ||
    initialErrorOutput.includes('is not recognized as an internal or external command') ||
    initialErrorOutput.includes('module is not defined in ES module scope') ||
    initialErrorOutput.includes('command not found')
  );

  if (isEnvError) {
    logger.error('Environment Configuration Error Detected!');
    logger.warn('Jest failed to parse the test file. This usually means your project is not configured to run TypeScript or ESM tests with Jest.');

    const missingDeps = checkMissingDependencies(cwd);
    if (missingDeps.length > 0) {
      const pkgManager = detectPackageManager(cwd);
      const cmd = getInstallCommand(pkgManager, missingDeps, cwd);
      logger.hint(`Missing testing dependencies detected: ${missingDeps.join(', ')}`);
      logger.hint(`Fix: Run \`${cmd}\` in your project and ensure jest.config.js is configured.`);
    } else {
      logger.hint('Fix: Please ensure your jest.config.js is correctly configured for your project.');
    }

    logger.info('Self-healing skipped (LLM cannot fix your project environment).');
    process.exit(1);
  }

  if (result.source === 'jest' && initialErrorOutput.includes('No tests found')) {
    logger.error('Jest Configuration Error Detected!');
    logger.warn('Jest could not find the generated test file (No tests found).');
    logger.hint('This usually means the generated file path does not match your Jest "testMatch" or "testRegex" configuration.');
    logger.hint(`Check if ${testFilePath} is included in your test matches.`);
    logger.info('Self-healing skipped (LLM cannot fix your Jest configuration).');
    process.exit(1);
  }

  if (!autoHeal) {
    const shouldHeal = await confirm({
      message: 'Validation failed. Do you want to auto-fix? (Tip: use --auto-heal to skip this prompt)',
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
    } catch (error) {
      logger.error(`Could not read test file for healing: ${String(error)}`);
      process.exit(1);
    }

    const diagnostics = formatRunOutput(result);

    let rootCause = '';
    try {
      rootCause = await llmClient.complete(
        buildAnalyzePrompt(faultyCode, diagnostics, result.source, attempt, maxRetries),
      );
    } catch (error) {
      logger.error(`LLM API failed during root-cause analysis: ${String(error)}`);
      process.exit(1);
    }

    rootCause = rootCause.trim().slice(0, 2_000) || 'The analyzer returned no diagnosis; use the diagnostics directly.';
    logger.info(`Root-cause analysis (${diagnosticName(result)}):`);
    logger.hint(rootCause);

    const conversation: ChatMessage[] = [...systemMessages];
    conversation.push({ role: 'assistant', content: faultyCode });
    conversation.push(buildFixPrompt(faultyCode, diagnostics, attempt, maxRetries, {
      diagnosticSource: result.source,
      rootCause,
      language: repairLanguage(testFilePath),
    }));

    let llmResponse = '';
    try {
      llmResponse = await llmClient.complete(conversation);
    } catch (error) {
      logger.error(`LLM API failed during healing: ${String(error)}`);
      process.exit(1);
    }

    let fixedCode = '';
    try {
      fixedCode = ensureTypeScriptJestReference(extractCodeBlock(llmResponse), testFilePath);
    } catch (error) {
      if (error instanceof ParseError) {
        logger.warn('LLM failed to output a valid code block.');
        const errorPath = await writeErrorLog(
          sourceDir,
          path.basename(testFilePath),
          `LLM Response Parse Error\n\nRaw Response:\n${error.rawResponse}`,
          cwd,
        );
        logger.hint(`Raw LLM response logged to: ${errorPath}`);

        result = {
          passed: false,
          stdout: '',
          stderr: 'ParseError: You forgot the code fence markers. Wrap the complete file in exactly one code block.',
          exitCode: 1,
          source: 'parse',
          lintSkipped: result.lintSkipped,
          lintIgnored: result.lintIgnored,
        };
        continue;
      }
      throw error;
    }

    await fs.writeFile(testFilePath, fixedCode, 'utf-8');
    logger.info('File updated with potential fix. Running lint, then Jest...');

    result = await validate(testFilePath, cwd);
    if (stopIfPassed(result, testFilePath, attempt)) return;

    logger.warn(`Self-healing attempt ${attempt} failed ${diagnosticName(result)} validation.`);
  }

  logger.error('Exhausted all self-healing retries. The test is still failing.');
  const errorPath = await writeErrorLog(
    sourceDir,
    path.basename(testFilePath),
    `Self-Heal Failed after ${maxRetries} retries.\n\nFinal ${diagnosticName(result)} output:\n${formatRunOutput(result)}\n\nFaulty Code:\n${await fs.readFile(testFilePath, 'utf-8')}`,
    cwd,
  );
  logger.info(`Detailed error log saved to: ${errorPath}`);
  process.exit(1);
}
