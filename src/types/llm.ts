/**
 * @file llm.ts
 * @description Shared types for the LLM layer.
 * Kept in `types/` so both `prompt-builder.ts` and `client.ts` can import
 * without creating a circular dependency between them.
 */

/**
 * A single message in the ChatCompletion conversation format.
 * Compatible with OpenAI's messages[] structure.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration required to instantiate an LLMClient.
 * Supports any OpenAI-compatible endpoint (OpenRouter, Ollama, Groq, Azure OpenAI, etc.).
 */
export interface LLMClientConfig {
  /** API key for the provider (can be 'ollama' or any placeholder for local providers) */
  apiKey: string;
  /** Base URL of the OpenAI-compatible endpoint. E.g. https://openrouter.ai/api/v1 */
  baseUrl: string;
  /** Model identifier. E.g. anthropic/claude-sonnet-4-5 */
  model: string;
  /** If true, log token usage after each completion */
  verbose?: boolean;
}
