# Codebase summary

## Runtime entry point

`src/index.ts` creates the Commander program, defines the public `aatest` name
and package-derived version, registers commands, and parses process arguments.

The build bundles this entry point to `dist/index.js`, which is exposed through
the package's `aatest` binary.

## Directory map

```text
src/
├── commands/
│   ├── init.ts
│   └── unit.ts
├── config/
│   └── env-writer.ts
├── llm/
│   └── client.ts
├── modules/
│   ├── ast-extractor.ts
│   ├── file-writer.ts
│   ├── heal.ts
│   ├── path-resolver.ts
│   ├── prompt-builder.ts
│   └── test-runner.ts
├── types/
│   ├── context.ts
│   └── llm.ts
├── utils/
│   ├── dependency-checker.ts
│   └── logger.ts
├── config.ts
└── index.ts
```

## Module responsibilities

| Module | Responsibility |
|---|---|
| `commands/init.ts` | Interactive environment configuration and project setup |
| `commands/unit.ts` | End-to-end generation orchestration |
| `config.ts` | Dotenv loading, aliases, defaults, precedence, validation |
| `config/env-writer.ts` | Safe `.env` or `.env.test-gen` persistence |
| `llm/client.ts` | OpenAI-compatible Chat Completions calls and API error mapping |
| `modules/ast-extractor.ts` | Babel parsing and source-context extraction |
| `modules/path-resolver.ts` | Relative source import calculation |
| `modules/prompt-builder.ts` | Generation, diagnosis, and repair prompts |
| `modules/file-writer.ts` | Output path, code-block parsing, backup, and error logs |
| `modules/test-runner.ts` | Static-check selection, process execution, and Jest validation |
| `modules/heal.ts` | Consent, root-cause analysis, repair loop, and early success |
| `utils/dependency-checker.ts` | Package-manager detection and target test setup |
| `utils/logger.ts` | Consistent terminal output |

## Important data types

- `ExtractedContext`: source path, content, language, module system, imports,
  exports, routes, test path, and relative import path.
- `ChatMessage`: provider-neutral system/user/assistant message.
- `LLMClientConfig`: API key, base URL, model, and verbosity.
- `ValidationResult`: process output plus diagnostic source and lint state.
- `SelfHealOptions`: test path, provider client, prompts, limits, and target cwd.

## External dependencies

| Package | Use |
|---|---|
| `commander` | CLI commands and options |
| `@inquirer/prompts` | Interactive setup and repair consent |
| `dotenv` | Environment-file loading |
| `openai` | OpenAI-compatible Chat Completions client |
| `@babel/parser`, `traverse`, `types` | JavaScript/TypeScript AST analysis |
| `chalk`, `ora` | Terminal styling and progress |
| `tsup` | ESM CLI bundle |
| `tsx` | Source development and test execution |

## Test suite

`test/unit-test-generator.test.ts` uses Node's built-in test runner and injected
dependencies to cover configuration aliases, retry validation, dependency
preflight, static-check relevance, diagnostic truncation, ten-attempt behavior,
and immediate stop after a passing repair.

The suite intentionally avoids live provider calls and real target-project Jest
execution. Release testing should also install the packed artifact into clean
JavaScript and TypeScript fixture projects.
