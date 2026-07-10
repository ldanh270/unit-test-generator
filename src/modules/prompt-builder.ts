/**
 * @file prompt-builder.ts
 * @description Converts an ExtractedContext into the messages[] array that
 * gets sent to the LLM. Keeps all prompt engineering in one place.
 *
 * Exports two functions:
 *   - buildGeneratePrompt   → first call (generate a test file from source)
 *   - buildFixPrompt        → follow-up call (fix a failing test file)
 */

import { ExtractedContext, ImportedDep } from '../types/context.js';
import { ChatMessage } from '../types/llm.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max chars of source code included in the user prompt before truncation. */
const MAX_FILE_CONTENT_CHARS = 8_000;

/** Max chars of Jest stderr included in the fix prompt. */
const MAX_STDERR_CHARS = 2_000;

// ---------------------------------------------------------------------------
// System prompt (fixed — never changes per call)
// ---------------------------------------------------------------------------

const getSystemPrompt = (language: string) => `You are an expert Node.js backend testing engineer.

Follow these STRICT rules WITHOUT exception:
1. Framework: Use Jest ONLY. Use Supertest for HTTP endpoint testing.
2. Pattern: Apply Arrange-Act-Assert (AAA) in EVERY describe/it block.
3. Mocking: Mock ALL external dependencies at the top using jest.mock().
   - Never allow real database calls, real HTTP calls, or real filesystem access.
4. Coverage: For EACH exported function/endpoint, write:
   - 1 Happy Path test (expected 2xx response)
   - At least 2 Error Case tests (4xx or 5xx)
5. Output format: Return ONLY the raw code.
   - NO explanation text before or after the code.
   - Wrap the ENTIRE output in exactly ONE code block: \`\`\`${language === 'typescript' ? 'typescript' : 'javascript'} ... \`\`\`
   - Do NOT split into multiple code blocks.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the messages[] array for the initial test-generation request.
 *
 * Truncation (Step 3.4): if `context.fileContent` exceeds 8 000 chars, the
 * full source is replaced with just the function signatures + JSDoc (first 5
 * lines of each function) to stay within model context windows.
 *
 * @param context   The ExtractedContext produced by `ast-extractor.ts`.
 * @param options   Reserved for future use (e.g. custom template path).
 * @returns         A two-element array: [systemMessage, userMessage].
 */
export function buildGeneratePrompt(
  context: ExtractedContext,
  _options?: Record<string, unknown>,
): ChatMessage[] {
  const systemMessage: ChatMessage = {
    role: 'system',
    content: getSystemPrompt(context.language),
  };

  const userMessage: ChatMessage = {
    role: 'user',
    content: buildUserPrompt(context),
  };

  return [systemMessage, userMessage];
}

/**
 * Builds a single user ChatMessage to append to an existing conversation
 * when the previously generated test file has Jest errors.
 *
 * Usage:
 * ```ts
 * const messages = buildGeneratePrompt(ctx);
 * // ... LLM replies with faultyCode ...
 * messages.push({ role: 'assistant', content: faultyCode });
 * messages.push(buildFixPrompt(faultyCode, stderr, 1, 3));
 * const fixed = await llm.complete(messages);
 * ```
 *
 * @param faultyCode  The broken test code returned by the LLM.
 * @param stderr      Raw Jest stderr output (will be truncated to 2 000 chars).
 * @param attempt     Current attempt number (1-based).
 * @param maxRetries  Total number of fix attempts allowed.
 * @returns           A user-role ChatMessage ready to append to messages[].
 */
export function buildFixPrompt(
  faultyCode: string,
  stderr: string,
  attempt: number,
  maxRetries: number,
): ChatMessage {
  const truncatedStderr =
    stderr.length > MAX_STDERR_CHARS
      ? stderr.slice(0, MAX_STDERR_CHARS) + '\n… (truncated)'
      : stderr;

  const content = `Attempt ${attempt}/${maxRetries}: The test file you generated has Jest errors.
Analyze the errors carefully and return a FULLY FIXED version.

=== FAULTY TEST CODE ===
${faultyCode}

=== JEST ERROR OUTPUT ===
${truncatedStderr}
--- end of error output ---

Return ONLY the fixed code in exactly ONE \`\`\`javascript ... \`\`\` block.
Do NOT explain the changes.`;

  return { role: 'user', content };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Assembles the dynamic user prompt from the extracted context.
 * Handles file-content truncation when the source exceeds the size limit.
 */
function buildUserPrompt(context: ExtractedContext): string {
  const parts: string[] = [];

  parts.push(
    'Analyze the following source file and generate a complete Jest + Supertest test suite.',
  );
  parts.push('');
  parts.push(`File: ${context.filePath}`);
  parts.push(`Language: ${context.language} | Module system: ${context.moduleSystem}`);
  parts.push('');

  // --- Source code section (with optional truncation) ---
  parts.push('=== SOURCE CODE ===');
  parts.push(buildSourceSection(context));
  parts.push('');

  // --- Import Context ---
  if (context.relativeImportPath) {
    parts.push('=== IMPORT CONTEXT ===');
    parts.push(`To import the tested functions from the source file into your test file, use the following exact relative path:`);
    parts.push(`import { ... } from '${context.relativeImportPath}';`);
    parts.push('');
  }

  // --- Dependencies section ---
  parts.push('=== DEPENDENCIES TO MOCK ===');
  if (context.imports.length === 0) {
    parts.push('(none detected)');
  } else {
    for (const dep of context.imports) {
      const specifiers = dep.specifiers.length > 0 ? ` → ${dep.specifiers.join(', ')}` : '';
      parts.push(`[${dep.category}] ${dep.source}${specifiers}`);
    }
  }
  parts.push('');

  // --- Exports section (only functions, arrows, defaults) ---
  parts.push('=== FUNCTIONS TO TEST ===');
  const testableExports = context.exports.filter(
    e => e.type === 'function' || e.type === 'arrow' || e.type === 'default',
  );
  if (testableExports.length === 0) {
    parts.push('(none detected)');
  } else {
    for (const exp of testableExports) {
      const asyncPrefix = exp.isAsync ? 'async ' : '';
      const paramList = exp.params.join(', ');
      parts.push(`- ${asyncPrefix}${exp.name}(${paramList}) [line ${exp.line}]`);
    }
  }
  parts.push('');

  // --- Express routes section (only if any were found) ---
  if (context.routes.length > 0) {
    parts.push('=== EXPRESS ENDPOINTS ===');
    for (const route of context.routes) {
      parts.push(`- ${route.method.toUpperCase().padEnd(6)} ${route.path}  → ${route.handler}`);
    }
    parts.push('');
  }

  parts.push('Generate the complete test file now.');

  return parts.join('\n');
}

/**
 * Returns either the full file content or a truncated version (signatures only)
 * if the content exceeds MAX_FILE_CONTENT_CHARS.
 *
 * Step 3.4 truncation strategy:
 *   - Keep function signatures + JSDoc (first 5 lines of each function body).
 *   - Append `// ... body truncated ...` after the kept lines.
 *   - Warn the user via logger before the API call.
 *   - Append a visible [WARNING] tag at the end of the user prompt.
 */
function buildSourceSection(context: ExtractedContext): string {
  if (context.fileContent.length <= MAX_FILE_CONTENT_CHARS) {
    return context.fileContent;
  }

  // File too large — warn user and truncate to signatures only
  logger.warn(
    `Source file is large (${context.fileContent.length} chars). ` +
      'Truncating to function signatures only before sending to LLM.',
  );

  const truncated = truncateToSignatures(context.fileContent);
  return (
    truncated +
    '\n\n[WARNING: Source code was truncated due to size. ' +
    'Focus on the signatures and exports listed above.]'
  );
}

/**
 * Naïve line-based truncation: keeps the first 5 lines of every function-like
 * block and replaces the remainder with a comment. This is intentionally simple
 * to avoid a second full AST parse inside the prompt builder.
 *
 * NOTE: For future improvement, the AST from the extractor could be passed in
 * directly to produce a more accurate signature extraction.
 */
function truncateToSignatures(source: string): string {
  const lines = source.split('\n');
  const result: string[] = [];
  let inFunctionBody = false;
  let braceDepth = 0;
  let linesInBody = 0;
  const KEEP_BODY_LINES = 5;

  for (const line of lines) {
    const isFunctionStart =
      /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
      /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
      /^\s*(export\s+default\s+)(async\s+)?function/.test(line);

    if (!inFunctionBody) {
      result.push(line);
      if (isFunctionStart && line.includes('{')) {
        inFunctionBody = true;
        braceDepth = countBraces(line);
        linesInBody = 1;
      }
    } else {
      braceDepth += countBraces(line);
      linesInBody++;

      if (linesInBody <= KEEP_BODY_LINES) {
        result.push(line);
      } else if (linesInBody === KEEP_BODY_LINES + 1) {
        result.push('  // ... body truncated ...');
      }

      if (braceDepth <= 0) {
        // Closing brace of the function — add closing } and reset state
        if (linesInBody > KEEP_BODY_LINES) {
          result.push('}');
        }
        inFunctionBody = false;
        braceDepth = 0;
        linesInBody = 0;
      }
    }
  }

  return result.join('\n');
}

/** Returns the net brace count change for a single line (+opens, -closes). */
function countBraces(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === '{') count++;
    else if (ch === '}') count--;
  }
  return count;
}
