# aatest

[![npm version](https://img.shields.io/npm/v/@ldanh270/aatest.svg?style=flat-square)](https://www.npmjs.com/package/@ldanh270/aatest)
[![Node.js](https://img.shields.io/node/v/@ldanh270/aatest.svg?style=flat-square)](https://www.npmjs.com/package/@ldanh270/aatest)
[![NPM Downloads](https://img.shields.io/npm/dt/@ldanh270/aatest?style=flat-square)](https://www.npmjs.com/package/@ldanh270/aatest)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](LICENSE)

Generate, validate, and repair Jest tests for JavaScript and TypeScript Node.js
projects from the command line.

`aatest` reads a source file with Babel AST analysis, sends structured context
to an OpenAI-compatible Chat Completions endpoint, writes the generated test,
and validates it in the target project. When healing is enabled, each failure
is diagnosed before the model rewrites the test.

## Highlights

- JavaScript and TypeScript source analysis
- Export, import, class-method, and Express-route context extraction
- OpenAI-compatible providers, including local 9Router instances
- Safe replacement with timestamped backups
- Lint-first validation followed by isolated Jest execution
- Root-cause analysis before every repair
- Early exit as soon as validation passes
- npm, pnpm, Yarn, and Bun project detection

## Requirements

- Node.js 18 or newer
- A target Node.js package containing `package.json`
- An OpenAI-compatible Chat Completions endpoint, API key, and model ID
- Jest-compatible source code; Express/Supertest projects are the primary use case

## Security first

`aatest` sends source code and failure diagnostics to the provider configured in
your environment. It also executes generated code with Jest inside your target
project. Review provider privacy terms, use a restricted test environment, and
never commit API keys. See [Security](SECURITY.md) before using the CLI on
sensitive code.

## Quick start

Run these commands from the package that owns the source file:

```bash
cd path/to/your-node-project
npm install --save-dev @ldanh270/aatest
npx @ldanh270/aatest init
```

Generate a test:

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts
```

Generate and automatically repair failures, up to ten repair attempts:

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts --auto-heal --retries 10
```

Preview the prompt and model response without writing the generated test:

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts --dry-run --verbose
```

> `--dry-run` prevents test-file writes and validation, but environment and
> dependency checks happen first. Confirm prompts carefully because setup may
> install test dependencies or update project test configuration.

## Use with 9Router

[9Router](https://github.com/decolua/9router#readme) exposes a local
OpenAI-compatible endpoint that can route requests across connected providers.

```bash
npm install --global 9router
9router
```

In the dashboard at `http://localhost:20128`:

1. Open **Providers** and connect a provider.
2. Copy the API key displayed by 9Router.
3. Copy a model ID from the dashboard, for example
   `kr/claude-sonnet-4.5` when available.
4. Configure `aatest` with:

```env
TEST_GEN_BASE_URL=http://localhost:20128/v1
TEST_GEN_API_KEY=your_9router_dashboard_key
TEST_GEN_MODEL=kr/claude-sonnet-4.5
TEST_GEN_SOURCE=./src/__tests__
TEST_GEN_MAX_RETRIES=10
```

Keep 9Router running while `aatest` generates or repairs tests. See
[Provider setup](docs/providers.md) for the complete walkthrough and generic
OpenAI-compatible configuration.

## Configuration

`npx @ldanh270/aatest init` writes configuration to `.env` in the directory where it is run.
If `.env` already exists and you choose not to append, it writes
`.env.test-gen` instead.

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `TEST_GEN_API_KEY` | Yes | — | Provider or proxy API key |
| `TEST_GEN_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API root |
| `TEST_GEN_MODEL` | Yes | — | Provider-specific model ID |
| `TEST_GEN_SOURCE` | Yes* | — | Generated-test output directory |
| `TEST_GEN_MAX_RETRIES` | No | `10` | Maximum repair attempts |

\* `--source` can supply the output directory for one invocation.

Legacy aliases are supported: `AATEST_API_KEY`, `AATEST_BASE_URL`,
`AATEST_MODEL`, `AATEST_SOURCE_DIR`, and `AATEST_MAX_RETRIES`.

Precedence is CLI option, canonical `TEST_GEN_*` variable, legacy `AATEST_*`
variable, then built-in default. `.env` is loaded first; `.env.test-gen` fills
only values that are still missing. See [Configuration](docs/configuration.md).

## CLI

```text
aatest init
aatest unit <file> [options]
```

| Option | Description |
|---|---|
| `-s, --source <dir>` | Override the generated-test directory |
| `-H, --auto-heal` | Repair failures without asking for confirmation |
| `-r, --retries <n>` | Set a positive maximum number of repair attempts |
| `--dry-run` | Print prompts and model output without writing the test |
| `-v, --verbose` | Print token usage and stack traces |

`--auto-heal` does not enable validation—validation always runs after a test is
written. It only skips the repair confirmation prompt after a failure. See the
[CLI reference](docs/cli-reference.md).

## Output and backups

With this configuration:

```env
TEST_GEN_SOURCE=./src/__tests__
```

this source file:

```text
src/controllers/user.controller.ts
```

produces:

```text
src/__tests__/controllers/user.controller.spec.ts
```

If the test already exists, it is copied to a timestamped `.bak` file before
being replaced. Failed healing logs are written under
`<sourceDir>/.test-gen-errors/`.

## Validation and self-healing

After generation, `aatest`:

1. Runs the first available static check: local ESLint, local Biome, the
   package `lint` script, or the package `typecheck` script.
2. Ignores project-wide static failures only when they do not reference the
   generated test.
3. Runs the generated file with Jest in-band and a 60-second timeout.
4. Stops immediately when validation passes.
5. On failure, asks the model for a root-cause analysis and then a complete
   corrected test file.

Each failed repair attempt can make two model calls: one diagnosis and one
rewrite. See [Self-healing](docs/self-healing.md) for limits and failure modes.

## Documentation

- [Getting started](docs/getting-started.md)
- [Provider setup](docs/providers.md)
- [Configuration](docs/configuration.md)
- [CLI reference](docs/cli-reference.md)
- [Self-healing](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Local development](docs/local-development.md)
- [Architecture](docs/system-architecture.md)
- [Documentation index](docs/README.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and coding
standards. Bug reports and focused pull requests are welcome.

## License

Licensed under the [Apache License 2.0](LICENSE).
