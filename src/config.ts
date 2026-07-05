/**
 * @file config.ts
 * @description Responsible for loading, parsing, and validating application configuration.
 * It combines environment variables loaded from the `.env` file with runtime CLI arguments.
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load variables from the `.env` file located in the user's Current Working Directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * The validated application configuration used throughout the execution.
 */
export interface TestGenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  sourceDir?: string;
  maxRetries: number;
}

/**
 * Loads and validates the configuration required to run the CLI.
 * Throws an error immediately if critical configuration is missing.
 * 
 * @param cliSourceOverride An optional output directory provided via CLI flags (has highest priority).
 * @returns The fully constructed configuration object.
 * @throws Error if API Key or Model is missing.
 */
export function loadConfig(cliSourceOverride?: string): TestGenConfig {
  const apiKey = process.env.TEST_GEN_API_KEY;
  if (!apiKey) {
    throw new Error('TEST_GEN_API_KEY is not set in .env. Please run `test-gen init` first.');
  }

  const model = process.env.TEST_GEN_MODEL;
  if (!model) {
    throw new Error('TEST_GEN_MODEL is not set in .env. Please run `test-gen init` first.');
  }

  // Fallback to OpenAI's default base URL if a proxy or alternative endpoint is not provided
  const baseUrl = process.env.TEST_GEN_BASE_URL || 'https://api.openai.com/v1';
  
  // CLI flag takes precedence over environment variable
  const sourceDir = cliSourceOverride || process.env.TEST_GEN_SOURCE;

  const maxRetries = parseInt(process.env.TEST_GEN_MAX_RETRIES || '3', 10);

  return {
    apiKey,
    baseUrl,
    model,
    sourceDir,
    maxRetries: isNaN(maxRetries) ? 3 : maxRetries,
  };
}
