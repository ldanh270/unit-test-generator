# aatest

> AI-powered unit test generator with AST-based context extraction and self-healing for Node.js.

[![npm version](https://img.shields.io/npm/v/@ldanh270/aatest.svg?style=flat-square)](https://www.npmjs.com/package/@ldanh270/aatest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

`aatest` is a CLI tool designed to eliminate the boilerplate of writing unit tests. By analyzing your Abstract Syntax Tree (AST), it understands your code's context and leverages Large Language Models (LLMs) to automatically generate, validate, and fix unit tests.

## Features

* **Zero-config setup** — Interactive CLI wizard to get you started immediately.
* **AST Context Parsing** — Accurately detects exports, internal dependencies, and functions.
* **Diagnostic Self-Healing** — Normalizes TypeScript/Jest ambient types, runs file-scoped lint (or project typecheck), analyzes the root cause, and feeds only diagnostics relevant to the generated test back to the AI.
* **LLM Agnostic** — Bring your own API key (OpenAI, Anthropic, OpenRouter).
* **Safe Mode** — Generates and backs up files automatically without overwriting your existing code.

## Getting Started

You can run `aatest` without installing it globally, using `npx`.

### 1. Initialize Configuration

Set up your workspace and LLM provider settings:

```bash
npx @ldanh270/aatest init
```

This will create a `.env` file in your root directory containing your API keys and output preferences.

### 2. Generate Tests

To generate tests for a specific file:

```bash
npx @ldanh270/aatest unit src/controllers/user.js
```

### 3. Generate with Auto-Heal

To let `aatest` automatically attempt to fix tests if they fail assertions:

```bash
npx @ldanh270/aatest unit src/controllers/user.js --auto-heal --retries 10
```

Validation runs in this order: local ESLint/Biome, the project's `lint` script,
the project's `typecheck` script, then Jest. Project-wide static errors that do
not reference the generated test file are reported but excluded from healing.

## Installation (Optional)

If you prefer to install it as a development dependency in your project:

```bash
npm install -D @ldanh270/aatest
```
You can then add it to your `package.json` scripts:
```json
{
  "scripts": {
    "test:gen": "aatest unit"
  }
}
```

## CLI Reference

### `init`
Starts the interactive setup wizard.

### `unit <file>`
Generates a unit test for the provided file path.

**Options:**
* `-s, --source <dir>`: Override the default output directory.
* `-H, --auto-heal`: Automatically run tests and attempt to fix failures.
* `-r, --retries <n>`: Maximum number of self-healing retries (default: 10).
* `--dry-run`: Output the generated code to the console without saving it.
* `-v, --verbose`: Enable verbose logging for debugging.

## Configuration

`aatest` reads from a `.env` file in your project root. These values are automatically populated by the `init` command:

```env
TEST_GEN_BASE_URL=https://api.openai.com/v1
TEST_GEN_API_KEY=your_api_key
TEST_GEN_MODEL=gpt-4o
TEST_GEN_SOURCE=./src/__tests__
TEST_GEN_MAX_RETRIES=10
```

The CLI reads `.env` (then `.env.test-gen` as a fallback) from the directory
where you invoke `aatest`. Legacy `AATEST_*` names are also accepted.

## Contributing

Contributions, issues and feature requests are welcome!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/fooBar`).
3. Commit your changes (`git commit -am 'Add some fooBar'`).
4. Push to the branch (`git push origin feature/fooBar`).
5. Create a new Pull Request.

## License

[MIT](LICENSE)
