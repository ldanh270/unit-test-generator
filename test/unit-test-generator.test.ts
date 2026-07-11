import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, parseMaxRetries } from '../src/config.js';
import {
  formatRunOutput,
  isStaticCheckFailureRelevant,
  resolveLintCommand,
  RunResult,
  validateTestFile,
  ValidationResult,
} from '../src/modules/test-runner.js';
import {
  buildAnalyzePrompt,
  buildFixPrompt,
  truncateDiagnostics,
} from '../src/modules/prompt-builder.js';
import { selfHeal } from '../src/modules/heal.js';
import { LLMClient } from '../src/llm/client.js';
import { ChatMessage } from '../src/types/llm.js';
import {
  checkMissingDependencies,
  ensureJestTypesInTsConfig,
} from '../src/utils/dependency-checker.js';

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    passed: false,
    stdout: '',
    stderr: 'failure',
    exitCode: 1,
    ...overrides,
  };
}

test('retry configuration accepts 10 and rejects invalid values', () => {
  assert.equal(parseMaxRetries('10'), 10);
  assert.equal(parseMaxRetries(undefined), 10);
  assert.throws(() => parseMaxRetries('0', 'TEST_GEN_MAX_RETRIES'), /positive integer/);
  assert.throws(() => parseMaxRetries('3oops', '--retries'), /positive integer/);
});

test('loadConfig supports documented legacy AATEST aliases', () => {
  const keys = [
    'TEST_GEN_API_KEY',
    'TEST_GEN_BASE_URL',
    'TEST_GEN_MODEL',
    'TEST_GEN_SOURCE',
    'TEST_GEN_MAX_RETRIES',
    'AATEST_API_KEY',
    'AATEST_BASE_URL',
    'AATEST_MODEL',
    'AATEST_SOURCE_DIR',
    'AATEST_MAX_RETRIES',
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    process.env.AATEST_API_KEY = 'test-key';
    process.env.AATEST_BASE_URL = 'https://example.test/v1';
    process.env.AATEST_MODEL = 'test-model';
    process.env.AATEST_SOURCE_DIR = './generated-tests';
    process.env.AATEST_MAX_RETRIES = '10';

    const config = loadConfig();
    assert.equal(config.maxRetries, 10);
    assert.equal(config.maxRetriesSource, 'AATEST_MAX_RETRIES');
    assert.equal(config.sourceDir, './generated-tests');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('resolveLintCommand prefers a local file-scoped ESLint binary', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aatest-lint-'));
  try {
    const binDir = path.join(tempDir, 'node_modules', '.bin');
    await fs.mkdir(binDir, { recursive: true });
    const executable = path.join(binDir, process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
    await fs.writeFile(executable, '', 'utf8');
    const testFile = path.join(tempDir, 'src', 'example.spec.ts');

    const command = resolveLintCommand(testFile, tempDir);
    assert.ok(command);
    assert.equal(command.command, executable);
    assert.deepEqual(command.args, [path.join('src', 'example.spec.ts')]);
    assert.equal(command.scope, 'file');
    assert.equal(command.tool, 'eslint');
  } finally {
    assert.ok(tempDir.startsWith(os.tmpdir()));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('TypeScript preflight installs Node types and injects Jest plus Node ambient types', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aatest-types-'));
  try {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: {
        typescript: '1.0.0',
        jest: '1.0.0',
        supertest: '1.0.0',
        '@types/jest': '1.0.0',
        '@types/supertest': '1.0.0',
        'ts-jest': '1.0.0',
      },
    }), 'utf8');
    await fs.writeFile(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { types: ['jest'] },
    }), 'utf8');

    assert.deepEqual(checkMissingDependencies(tempDir), ['@types/node']);
    ensureJestTypesInTsConfig(tempDir);

    const tsconfig = JSON.parse(await fs.readFile(path.join(tempDir, 'tsconfig.json'), 'utf8'));
    assert.deepEqual(tsconfig.compilerOptions.types, ['jest', 'node']);
  } finally {
    assert.ok(tempDir.startsWith(os.tmpdir()));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('static checks fall back to typecheck when no lint tool or script exists', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aatest-typecheck-'));
  try {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: { typecheck: 'tsc --noEmit' },
    }), 'utf8');

    const command = resolveLintCommand(path.join(tempDir, 'src', 'example.spec.ts'), tempDir);
    assert.ok(command);
    assert.deepEqual(command.args, ['run', 'typecheck']);
    assert.equal(command.scope, 'project');
    assert.equal(command.tool, 'typecheck');
  } finally {
    assert.ok(tempDir.startsWith(os.tmpdir()));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('project-wide static failures are relevant only when they name the generated file', () => {
  const cwd = path.resolve('target-project');
  const testFile = path.join(cwd, 'src', '__tests__', 'auth.service.spec.ts');

  assert.equal(isStaticCheckFailureRelevant(result({
    stderr: 'src/__tests__/employee.service.spec.ts(10,2): error TS2322',
    staticCheckScope: 'project',
    staticCheckTool: 'typecheck',
  }), testFile, cwd), false);

  assert.equal(isStaticCheckFailureRelevant(result({
    stderr: 'src/__tests__/auth.service.spec.ts(10,2): error TS2322',
    staticCheckScope: 'project',
    staticCheckTool: 'typecheck',
  }), testFile, cwd), true);
});

test('validateTestFile feeds lint failures back before Jest', async () => {
  let jestCalls = 0;
  const lintFailure = await validateTestFile('example.spec.ts', process.cwd(), {
    runLint: async () => result({ stderr: 'lint says semicolon is missing' }),
    runJest: async () => {
      jestCalls++;
      return result();
    },
  });

  assert.equal(lintFailure.source, 'lint');
  assert.equal(jestCalls, 0);

  const jestFailure = await validateTestFile('example.spec.ts', process.cwd(), {
    runLint: async () => result({ passed: true, stderr: '', exitCode: 0 }),
    runJest: async () => {
      jestCalls++;
      return result({ stderr: 'expected 200, received 500' });
    },
  });

  assert.equal(jestFailure.source, 'jest');
  assert.equal(jestCalls, 1);
});

test('validateTestFile ignores unrelated project errors but keeps generated-file errors', async () => {
  const cwd = path.resolve('target-project');
  const testFile = path.join(cwd, 'src', '__tests__', 'auth.service.spec.ts');
  let jestCalls = 0;

  const unrelated = await validateTestFile(testFile, cwd, {
    runLint: async () => result({
      stderr: 'src/__tests__/employee.service.spec.ts(1,1): error TS2322',
      staticCheckScope: 'project',
      staticCheckTool: 'typecheck',
    }),
    runJest: async () => {
      jestCalls++;
      return result({ passed: true, stderr: '', exitCode: 0 });
    },
  });
  assert.equal(unrelated.source, 'jest');
  assert.equal(unrelated.passed, true);
  assert.equal(unrelated.lintIgnored, true);
  assert.equal(jestCalls, 1);

  const relevant = await validateTestFile(testFile, cwd, {
    runLint: async () => result({
      stderr: 'src/__tests__/auth.service.spec.ts(1,1): error TS2322',
      staticCheckScope: 'project',
      staticCheckTool: 'typecheck',
    }),
    runJest: async () => {
      jestCalls++;
      return result({ passed: true });
    },
  });
  assert.equal(relevant.source, 'lint');
  assert.equal(relevant.lintIgnored, false);
  assert.equal(jestCalls, 1);
});

test('diagnostic prompts preserve both streams, root cause, and long-output tail', () => {
  const combined = formatRunOutput(result({
    stderr: 'syntax error',
    stdout: 'compiler context',
  }));
  assert.match(combined, /syntax error/);
  assert.match(combined, /compiler context/);

  const longDiagnostics = `HEAD-${'x'.repeat(7_000)}-TAIL`;
  const truncated = truncateDiagnostics(longDiagnostics);
  assert.match(truncated, /^HEAD-/);
  assert.match(truncated, /middle omitted/);
  assert.match(truncated, /-TAIL$/);

  const analysis = buildAnalyzePrompt('bad code', combined, 'lint', 2, 10);
  assert.match(analysis[1].content, /LINT DIAGNOSTICS/);
  assert.match(analysis[1].content, /2\/10/);

  const fix = buildFixPrompt('bad code', combined, 2, 10, {
    diagnosticSource: 'lint',
    rootCause: 'The generated import points at the wrong module.',
    language: 'typescript',
  });
  assert.match(fix.content, /ROOT CAUSE ANALYSIS/);
  assert.match(fix.content, /wrong module/);
  assert.match(fix.content, /```typescript/);
});

test('selfHeal honors 10 retries and uses the latest lint output before each fix', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aatest-heal-'));
  const testFilePath = path.join(tempDir, 'example.spec.ts');
  await fs.writeFile(testFilePath, 'const broken = true;', 'utf8');

  let validationCalls = 0;
  const validate = async (): Promise<ValidationResult> => {
    const call = validationCalls++;
    if (call >= 10) {
      return {
        passed: true,
        stdout: 'PASS',
        stderr: '',
        exitCode: 0,
        source: 'jest',
        lintSkipped: false,
      };
    }

    return {
      passed: false,
      stdout: `lint context ${call}`,
      stderr: `lint issue ${call}`,
      exitCode: 1,
      source: 'lint',
      lintSkipped: false,
    };
  };

  const llmCalls: ChatMessage[][] = [];
  let completionCalls = 0;
  const llmClient = {
    complete: async (messages: ChatMessage[]) => {
      llmCalls.push(messages);
      const call = completionCalls++;
      if (call % 2 === 0) return `- Root cause for attempt ${Math.floor(call / 2) + 1}`;
      return '```typescript\nconst fixed = true;\n```';
    },
  } as unknown as LLMClient;

  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    await selfHeal({
      testFilePath,
      sourceDir: tempDir,
      llmClient,
      systemMessages: [{ role: 'system', content: 'Return one complete test file.' }],
      maxRetries: 10,
      autoHeal: true,
      cwd: tempDir,
    }, { validate });

    assert.equal(validationCalls, 11, 'initial validation plus one validation per repair');
    assert.equal(completionCalls, 20, 'one diagnosis and one repair call per attempt');

    const secondRepairPrompt = llmCalls[3].at(-1)?.content ?? '';
    assert.match(secondRepairPrompt, /lint issue 1/);
    assert.match(secondRepairPrompt, /Root cause for attempt 2/);

    const finalCode = await fs.readFile(testFilePath, 'utf8');
    assert.match(finalCode, /^\/\/\/ <reference types="jest" \/>/);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    assert.ok(tempDir.startsWith(os.tmpdir()));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('selfHeal stops immediately when validation passes on attempt 4', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aatest-stop-pass-'));
  const testFilePath = path.join(tempDir, 'example.spec.ts');
  await fs.writeFile(testFilePath, 'const broken = true;', 'utf8');

  let validationCalls = 0;
  const validate = async (): Promise<ValidationResult> => {
    const call = validationCalls++;
    const passed = call === 4;
    return {
      passed,
      stdout: passed ? 'PASS' : '',
      stderr: passed ? '' : `failure ${call}`,
      exitCode: passed ? 0 : 1,
      source: 'jest',
      lintSkipped: false,
    };
  };

  let completionCalls = 0;
  const llmClient = {
    complete: async () => {
      const call = completionCalls++;
      if (call % 2 === 0) return '- Root cause';
      return '```typescript\nconst fixed = true;\n```';
    },
  } as unknown as LLMClient;

  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    await selfHeal({
      testFilePath,
      sourceDir: tempDir,
      llmClient,
      systemMessages: [{ role: 'system', content: 'Return one complete test file.' }],
      maxRetries: 10,
      autoHeal: true,
      cwd: tempDir,
    }, { validate });

    assert.equal(validationCalls, 5, 'initial validation plus four repair validations');
    assert.equal(completionCalls, 8, 'four diagnoses and four repairs; attempts 5-10 never run');
  } finally {
    console.log = originalLog;
    console.error = originalError;
    assert.ok(tempDir.startsWith(os.tmpdir()));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
