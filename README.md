# 🧪 aatest - Auto AI Test Generator

[![npm version](https://img.shields.io/npm/v/@ldanh270/aatest.svg)](https://www.npmjs.com/package/@ldanh270/aatest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**aatest** is a powerful CLI tool that automatically generates unit tests for your Node.js and Express.js applications using AI. It comes with built-in AST-based context extraction and self-healing capabilities, ensuring your tests are not only generated but also fixed automatically if they fail.

## ✨ Features

- 🤖 **AI-Powered Generation**: Uses LLMs (OpenAI, Anthropic via OpenRouter, etc.) to write robust unit tests.
- 🛠 **Interactive Setup**: Easy-to-use configuration wizard.
- 🧠 **AST Context Extraction**: Analyzes your code to understand exports and dependencies before generating tests.
- 🏥 **Self-Healing**: Automatically detects failing tests and attempts to fix them iteratively.
- 🛡 **Safe File Operations**: Automatically backs up existing test files before overwriting.

---

## 📦 Installation

You can install the package globally or locally in your project as a dev dependency.

**Using npm:**
```bash
npm install -D @ldanh270/aatest
```

**Using pnpm:**
```bash
pnpm add -D @ldanh270/aatest
```

**Using yarn:**
```bash
yarn add -D @ldanh270/aatest
```

> **Tip:** You can also run it directly without installing via `npx @ldanh270/aatest`.

---

## 🚀 Quick Start (Step-by-Step)

### Step 1: Initialize Configuration

Before generating tests, you need to set up your API keys and preferences. Run the `init` command in the root of your project:

```bash
npx aatest init
```

The interactive wizard will ask you a few questions:
1. **API Base URL**: Default is `https://api.openai.com/v1`. You can change this to use custom providers (e.g., OpenRouter).
2. **API Key**: Enter your OpenAI or custom provider API key.
3. **Model Name**: E.g., `gpt-4o` or `anthropic/claude-3-5-sonnet`.
4. **Default Output Directory**: Where the generated tests will be saved (e.g., `./src/__tests__`).
5. **Max Retries**: Number of times the AI will try to fix a failing test (Self-Healing).

This will generate a `.env` file containing your configurations.

### Step 2: Generate Tests for a File

Once initialized, simply point `aatest` to the file you want to generate tests for:

```bash
npx aatest unit src/controllers/user.controller.js
```

**What happens behind the scenes?**
1. Analyzes `src/controllers/user.controller.js` to extract context and exports.
2. Sends the context to the configured LLM to generate the test file.
3. Writes the test file into the output directory you configured.

### Step 3: Self-Healing (Optional)

If you want the tool to automatically run and fix the generated tests if they fail, use the `-H` (auto-heal) flag:

```bash
npx aatest unit src/controllers/user.controller.js -H
```

---

## 🛠 Command Reference

### `aatest init`
Initializes the configuration wizard and saves preferences to a `.env` file.

### `aatest unit <file> [options]`
Generates unit tests for a specific file.

| Option | Shorthand | Description | Default |
|--------|-----------|-------------|---------|
| `--source <dir>` | `-s` | Override the default output test directory. | From `.env` |
| `--auto-heal` | `-H` | Automatically attempt to fix failing tests. | `false` |
| `--retries <n>` | `-r` | Max retries for self-healing. | From `.env` (`3`) |
| `--dry-run` | | Print the prompt and LLM response without writing files. | `false` |
| `--verbose` | `-v` | Enable verbose logging. | `false` |

---

## ⚙️ Configuration (`.env`)

If you prefer to set up your `.env` manually or use it in CI/CD, these are the variables `aatest` looks for (handled by the init wizard):

```env
AATEST_BASE_URL=https://api.openai.com/v1
AATEST_API_KEY=sk-your-api-key
AATEST_MODEL=gpt-4o
AATEST_SOURCE_DIR=./src/__tests__
AATEST_MAX_RETRIES=3
```
*(Note: Check your actual `.env` key mappings if they differ, the CLI handles the prefixing natively).*

---

## 💡 Examples

**Dry Run:** See what the AI would generate without saving the file:
```bash
npx aatest unit src/utils/math.js --dry-run
```

**Custom Output Directory:** Override the default output folder for a specific run:
```bash
npx aatest unit src/services/auth.service.js -s ./tests/integration
```

**Verbose Mode:** See detailed logs to debug what the CLI is doing:
```bash
npx aatest unit src/app.js -v
```

---

## 🤝 Contributing
Issues and Pull Requests are welcome! Feel free to open an issue if you have questions or feature requests.

## 📄 License
This project is licensed under the MIT License.