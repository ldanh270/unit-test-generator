/**
 * @file config.ts
 * @description Responsible for loading, parsing, and validating application configuration.
 * It combines environment variables loaded from the `.env` file with runtime CLI arguments.
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load configuration from the invocation directory. `.env` remains canonical;
// `.env.test-gen` is the fallback written by `init` when users preserve `.env`.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.test-gen') });

export const DEFAULT_MAX_RETRIES = 10;

/**
 * The validated application configuration used throughout the execution.
 */
export interface TestGenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  sourceDir?: string;
  maxRetries: number;
  maxRetriesSource: string;
}

/** Parses a positive integer retry limit and rejects silent invalid fallbacks. */
export function parseMaxRetries(
  value: string | undefined,
  source: string = 'retry configuration',
): number {
  if (value === undefined) return DEFAULT_MAX_RETRIES;

  const normalized = value.trim();
  const parsed = Number(normalized);
  if (!normalized || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${source} must be a positive integer; received "${value}".`);
  }

  return parsed;
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
  const apiKey = process.env.TEST_GEN_API_KEY || process.env.AATEST_API_KEY;
  if (!apiKey) {
    throw new Error('TEST_GEN_API_KEY (or AATEST_API_KEY) is not set. Please run `test-gen init` first.');
  }

  const model = process.env.TEST_GEN_MODEL || process.env.AATEST_MODEL;
  if (!model) {
    throw new Error('TEST_GEN_MODEL (or AATEST_MODEL) is not set. Please run `test-gen init` first.');
  }

  // Fallback to OpenAI's default base URL if a proxy or alternative endpoint is not provided
  const baseUrl = process.env.TEST_GEN_BASE_URL || process.env.AATEST_BASE_URL || 'https://api.openai.com/v1';
  
  // CLI flag takes precedence over environment variable
  const sourceDir = cliSourceOverride || process.env.TEST_GEN_SOURCE || process.env.AATEST_SOURCE_DIR;

  const primaryRetries = process.env.TEST_GEN_MAX_RETRIES;
  const aliasRetries = process.env.AATEST_MAX_RETRIES;
  const rawMaxRetries = primaryRetries ?? aliasRetries;
  const maxRetriesSource = primaryRetries !== undefined
    ? 'TEST_GEN_MAX_RETRIES'
    : aliasRetries !== undefined
      ? 'AATEST_MAX_RETRIES'
      : `default (${DEFAULT_MAX_RETRIES})`;
  const maxRetries = parseMaxRetries(rawMaxRetries, maxRetriesSource);

  return {
    apiKey,
    baseUrl,
    model,
    sourceDir,
    maxRetries,
    maxRetriesSource,
  };
}
