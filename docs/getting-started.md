# Getting started

This guide installs `aatest` in a Node.js package and generates a Jest test from
a JavaScript or TypeScript source file.

## 1. Choose the target package

Open a terminal in the package that owns the source code:

```bash
cd path/to/backend
```

The directory should contain `package.json`. Configuration is loaded from the
directory where `aatest` is invoked, while the target project root is found by
walking upward from the source file to the nearest `package.json`.

In a monorepo, run from the intended workspace package whenever possible. This
keeps environment loading, dependency checks, lint scripts, and Jest execution
scoped to that package.

## 2. Install the CLI

Choose the command for the target project:

```bash
# npm
npm install --save-dev @ldanh270/aatest

# pnpm
pnpm add --save-dev @ldanh270/aatest

# Yarn
yarn add --dev @ldanh270/aatest

# Bun
bun add --dev @ldanh270/aatest
```

Verify the installed binary:

```bash
npx @ldanh270/aatest --version
npx @ldanh270/aatest --help
```

## 3. Configure a provider

Run the interactive wizard:

```bash
npx @ldanh270/aatest init
```

It asks for:

- OpenAI-compatible base URL
- API key
- Model ID
- Generated-test output directory
- Maximum healing retries

If `.env` does not exist, the wizard creates it. If `.env` exists, you may
append the settings or preserve it and create `.env.test-gen`.

You can also create the configuration manually:

```env
TEST_GEN_BASE_URL=http://localhost:20128/v1
TEST_GEN_API_KEY=replace_me
TEST_GEN_MODEL=replace_with_dashboard_model_id
TEST_GEN_SOURCE=./src/__tests__
TEST_GEN_MAX_RETRIES=10
```

See [Providers](providers.md) for 9Router and other endpoint examples.

## 4. Understand setup changes

Both `init` and `unit` inspect the target project. After interactive
confirmation, setup can:

- Install `jest` and `supertest`
- Install `typescript`, `ts-jest`, `@types/jest`, `@types/supertest`, and
  `@types/node` support when the project is TypeScript
- Add a missing `test` script to `package.json`
- Create a Jest configuration for TypeScript
- Add `jest` and `node` to `compilerOptions.types`
- Reconcile multiple Jest configs by making the test script select one

Use a clean Git branch so these changes are easy to review.

## 5. Preview generation

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts --dry-run --verbose
```

The command prints the system prompt, source-context prompt, and raw model
response. It does not write or validate the generated test. Setup checks still
run before the dry-run branch and may prompt for the changes listed above.

## 6. Generate a test

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts
```

For this layout:

```text
backend/
├── package.json
└── src/
    └── controllers/
        └── user.controller.ts
```

and this setting:

```env
TEST_GEN_SOURCE=./src/__tests__
```

the output is:

```text
src/__tests__/controllers/user.controller.spec.ts
```

If that file exists, `aatest` first creates a sibling backup similar to:

```text
user.controller.spec.2026-07-11T10-30-00.bak
```

## 7. Enable automatic repair

```bash
npx @ldanh270/aatest unit src/controllers/user.controller.ts --auto-heal --retries 10
```

Validation always runs. Without `--auto-heal`, a failure triggers a confirmation
prompt before repair. With it, diagnosis and repair start automatically.

The retry count is a maximum. If attempt 4 passes with a maximum of 10, the CLI
stops immediately and attempts 5 through 10 do not run.

## 8. Review the result

Generated tests are model output. Review mocks, assertions, import paths, and
security-sensitive behavior before committing. Then run the target project's
normal lint and test commands.

Next: [CLI reference](cli-reference.md) and [Self-healing](self-healing.md).
