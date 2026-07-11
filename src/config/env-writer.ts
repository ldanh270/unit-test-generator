/**
 * @file env-writer.ts
 * @description Encapsulates file system operations related to the configuration files.
 * Handles checking, formatting, and safely writing the environment variables without leaking UI logic.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Interface representing the required configuration keys.
 */
export interface EnvConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  sourceDir: string;
  maxRetries: string;
}

/**
 * Writer class for environment configurations.
 */
export class EnvWriter {
  private readonly defaultEnvPath: string;
  private readonly altEnvPath: string;

  /**
   * Initializes the EnvWriter with absolute paths to target config files.
   * @param cwd The current working directory (defaults to process.cwd())
   */
  constructor(cwd: string = process.cwd()) {
    this.defaultEnvPath = path.resolve(cwd, '.env');
    this.altEnvPath = path.resolve(cwd, '.env.test-gen');
  }

  /**
   * Checks if the default .env file already exists in the target directory.
   * @returns Promise resolving to true if file exists, false otherwise.
   */
  async checkEnvExists(): Promise<boolean> {
    try {
      await fs.access(this.defaultEnvPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Formats and writes the environment configuration to the disk.
   * If appending, it modifies the existing `.env`.
   * Otherwise, it creates `.env` (or `.env.test-gen` if `.env` exists and user opts out of appending).
   * 
   * @param config The configuration object to serialize.
   * @param appendToExisting Whether to append the config to an existing `.env` file.
   * @returns Promise resolving to the absolute path of the written file.
   */
  async writeConfig(config: EnvConfig, appendToExisting: boolean = false): Promise<string> {
    const envContent = this.formatEnvContent(config);

    if (appendToExisting) {
      await fs.appendFile(this.defaultEnvPath, `\n\n# aatest Configuration\n${envContent}\n`);
      return this.defaultEnvPath;
    }

    const targetPath = (await this.checkEnvExists()) ? this.altEnvPath : this.defaultEnvPath;
    await fs.writeFile(targetPath, `${envContent}\n`);
    return targetPath;
  }

  /**
   * Serializes the configuration object into a standard INI/ENV format.
   * @param config The configuration to serialize.
   * @returns Formatted string ready to be written to a file.
   */
  private formatEnvContent(config: EnvConfig): string {
    return `TEST_GEN_API_KEY=${config.apiKey}
TEST_GEN_BASE_URL=${config.baseUrl}
TEST_GEN_MODEL=${config.model}
TEST_GEN_SOURCE=${config.sourceDir}
TEST_GEN_MAX_RETRIES=${config.maxRetries}`;
  }
}
