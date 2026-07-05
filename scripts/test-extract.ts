// scripts/test-extract.ts
import { extractContext } from '../src/modules/ast-extractor.js';
import chalk from 'chalk';

async function run() {
  try {
    console.log(chalk.blue('Running AST Extraction test...'));
    const ctx = await extractContext('./test-fixtures/user.controller.js');
    console.log(chalk.green('SUCCESS! Extracted Context:'));
    console.log(JSON.stringify(ctx, null, 2));
  } catch (error) {
    console.error(chalk.red('Extraction failed:'), error);
    process.exit(1);
  }
}

run();
