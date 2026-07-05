// scripts/test-prompt.ts
// Verify script for Phase 3: reads a fixture → extractContext → buildGeneratePrompt → prints prompt.
// Run with: npx tsx scripts/test-prompt.ts

import { extractContext } from '../src/modules/ast-extractor.js';
import { buildGeneratePrompt } from '../src/modules/prompt-builder.js';
import chalk from 'chalk';

async function run() {
  try {
    console.log(chalk.blue('Running Prompt Builder test...'));

    const ctx = await extractContext('./test-fixtures/user.controller.js');
    const messages = buildGeneratePrompt(ctx);

    console.log(chalk.bold.magenta('\n=== SYSTEM PROMPT ==='));
    console.log(messages[0].content);

    console.log(chalk.bold.cyan('\n=== USER PROMPT ==='));
    console.log(messages[1].content);

    console.log(chalk.green('\nSUCCESS! Prompt built correctly.'));
    console.log(
      chalk.gray(
        `  System prompt length : ${messages[0].content.length} chars\n` +
          `  User prompt length   : ${messages[1].content.length} chars`,``
      ),
    );
  } catch (error) {
    console.error(chalk.red('Prompt building failed:'), error);
    process.exit(1);
  }
}

run();
