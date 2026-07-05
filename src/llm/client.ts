/**
 * @file client.ts
 * @description Generic LLM client built on top of the `openai` SDK.
 *
 * Works with ANY OpenAI-compatible endpoint by swapping `baseURL` + `apiKey`:
 *   - OpenRouter  → https://openrouter.ai/api/v1
 *   - Groq        → https://api.groq.com/openai/v1
 *   - Ollama      → http://localhost:11434/v1
 *   - Azure OpenAI → https://<resource>.openai.azure.com/openai/deployments/<model>
 *   - LM Studio   → http://localhost:1234/v1
 *
 * Error handling follows a strict policy (see table in PHASE3_SPEC.md):
 *   - 401  → invalid API key
 *   - 429  → rate-limited (one auto-retry after 5 s)
 *   - 402  → insufficient credits
 *   - 400/413 → prompt/context too large
 *   - Network → connection/URL problem
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { ChatMessage, LLMClientConfig } from '../types/llm.js';

/**
 * Thin wrapper around the OpenAI SDK that handles retry logic, error mapping,
 * and optional token-usage logging.
 */
export class LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly verbose: boolean;

  constructor(config: LLMClientConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.verbose = config.verbose ?? false;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * Sends a list of messages to the LLM and returns the raw text content of
   * the first choice. Implements the error-handling policy from the spec.
   *
   * @param messages  The full conversation so far (system + user messages).
   * @returns         The assistant's reply as a plain string.
   * @throws          A descriptive Error for every non-retriable failure.
   */
  async complete(messages: ChatMessage[]): Promise<string> {
    return this._callWithRetry(messages, 0);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _callWithRetry(messages: ChatMessage[], attempt: number): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
      });

      if (this.verbose) {
        const usage = response.usage;
        if (usage) {
          const prompt = usage.prompt_tokens.toLocaleString();
          const completion = usage.completion_tokens.toLocaleString();
          const total = usage.total_tokens.toLocaleString();
          logger.info(`Tokens used: ${prompt} prompt + ${completion} completion = ${total} total`);
        }
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('LLM returned an empty response. Please try again.');
      }

      return content;
    } catch (error: any) {
      return this._handleError(error, messages, attempt);
    }
  }

  /**
   * Maps SDK / HTTP errors to user-friendly messages and implements the
   * single-retry policy for rate-limit (429) responses.
   */
  private async _handleError(
    error: any,
    messages: ChatMessage[],
    attempt: number,
  ): Promise<string> {
    // OpenAI SDK wraps HTTP errors in APIError with a .status field
    const status: number | undefined = error?.status;

    if (status === 401) {
      throw new Error('Invalid API key. Check TEST_GEN_API_KEY in your .env');
    }

    if (status === 402) {
      throw new Error(`Insufficient credits. Top up your account at ${this.baseUrl}`);
    }

    if (status === 400 || status === 413) {
      throw new Error('Context too large. Try a smaller file or --truncate flag');
    }

    if (status === 429) {
      if (attempt === 0) {
        logger.warn('Rate limited by the API. Waiting 5 seconds before retrying…');
        await this._sleep(5_000);
        return this._callWithRetry(messages, 1);
      }
      throw new Error('Rate limit exceeded even after retry. Please wait and try again.');
    }

    // Network / DNS / ECONNREFUSED
    if (
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ENOTFOUND' ||
      error?.message?.includes('fetch failed') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('ENOTFOUND')
    ) {
      throw new Error('Network error. Check your connection and BASE_URL setting');
    }

    // Re-throw anything else with the original message for debuggability
    throw error instanceof Error
      ? error
      : new Error(`LLM request failed: ${String(error)}`);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
