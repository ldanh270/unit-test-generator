# CLI reference

## Global command

```text
aatest [options] [command]
```

```bash
aatest --help
aatest --version
```

When installed as a project dependency, invoke it through the package manager:

```bash
npx aatest --help
pnpm exec aatest --help
yarn aatest --help
bunx aatest --help
```

## `aatest init`

Starts an interactive configuration and test-environment setup wizard.

```bash
npx aatest init
```

Prompts for base URL, API key, model ID, output directory, and maximum retries.
It writes `.env`, appends to an existing `.env`, or writes `.env.test-gen` when
you choose to preserve an existing `.env`.

After configuration, it inspects the current package and may ask to:

- Install missing Jest/Supertest dependencies
- Add a missing test script
- Create TypeScript Jest configuration
- Update TypeScript ambient types
- Reconcile multiple Jest configuration files

Review the Git diff after running it.

## `aatest unit <file>`

Generates and validates one test file.

```bash
npx aatest unit src/controllers/user.controller.ts
```

The source path may be relative to the invocation directory or absolute.

### Options

#### `-s, --source <dir>`

Overrides `TEST_GEN_SOURCE` for this invocation.

```bash
npx aatest unit src/services/auth.ts --source ./test/generated
```

#### `-H, --auto-heal`

Skips the confirmation prompt before repairing a validation failure.

```bash
npx aatest unit src/services/auth.ts --auto-heal
```

Validation runs with or without this flag.

#### `-r, --retries <n>`

Overrides the maximum repair-attempt count. The value must be a positive
integer.

```bash
npx aatest unit src/services/auth.ts --auto-heal --retries 10
```

#### `--dry-run`

Prints the system prompt, user prompt, and raw model response. It does not write
the generated test or run validation.

```bash
npx aatest unit src/services/auth.ts --dry-run
```

Dependency and configuration setup occurs before the dry-run branch.

#### `-v, --verbose`

Prints provider token usage and error stack traces when available.

```bash
npx aatest unit src/services/auth.ts --dry-run --verbose
```

## Command lifecycle

`aatest unit` performs these steps:

1. Loads configuration from the invocation directory.
2. Resolves the source path and nearest target `package.json`.
3. Checks target test dependencies and configuration.
4. Parses source context with Babel.
5. Calculates the output and relative import paths.
6. Calls the configured model.
7. Backs up and writes the generated test unless `--dry-run` is active.
8. Runs static validation and Jest.
9. Prompts for or automatically starts repair when validation fails.

## Exit behavior

The command exits successfully when generation and validation pass, when a
dry-run completes, or when the user declines generation for a file without
exports. Configuration, provider, environment, and exhausted-retry failures exit
with a non-zero status.
