# Configuration

## Configuration files

At process startup, `aatest` loads files from the invocation directory in this
order:

1. `.env`
2. `.env.test-gen`

Values already loaded from `.env` or the parent shell are not overwritten.
`.env.test-gen` therefore acts as a fallback, not an override.

Run the CLI from the package whose configuration you intend to use:

```bash
cd path/to/backend
npx aatest unit src/services/user.service.ts
```

## Canonical variables

| Variable | Required | Default | Validation |
|---|---:|---|---|
| `TEST_GEN_API_KEY` | Yes | — | Must be non-empty |
| `TEST_GEN_BASE_URL` | No | `https://api.openai.com/v1` | Passed to the OpenAI SDK |
| `TEST_GEN_MODEL` | Yes | — | Must be non-empty |
| `TEST_GEN_SOURCE` | Yes unless `--source` is used | — | Relative or absolute path |
| `TEST_GEN_MAX_RETRIES` | No | `10` | Positive integer |

Example:

```env
TEST_GEN_API_KEY=replace_me
TEST_GEN_BASE_URL=http://localhost:20128/v1
TEST_GEN_MODEL=replace_with_exact_model_id
TEST_GEN_SOURCE=./src/__tests__
TEST_GEN_MAX_RETRIES=10
```

## Legacy aliases

| Canonical | Alias |
|---|---|
| `TEST_GEN_API_KEY` | `AATEST_API_KEY` |
| `TEST_GEN_BASE_URL` | `AATEST_BASE_URL` |
| `TEST_GEN_MODEL` | `AATEST_MODEL` |
| `TEST_GEN_SOURCE` | `AATEST_SOURCE_DIR` |
| `TEST_GEN_MAX_RETRIES` | `AATEST_MAX_RETRIES` |

Canonical names win when both forms are set.

## Precedence

For the output directory:

```text
--source
  > TEST_GEN_SOURCE
  > AATEST_SOURCE_DIR
```

For retries:

```text
--retries
  > TEST_GEN_MAX_RETRIES
  > AATEST_MAX_RETRIES
  > 10
```

For provider settings:

```text
TEST_GEN_*
  > AATEST_*
  > built-in base URL default where applicable
```

Shell environment variables normally win over both dotenv files because
dotenv does not overwrite existing process values.

## Output directory resolution

An absolute `TEST_GEN_SOURCE` is used directly. A relative path is resolved from
the target project root—the nearest parent of the source file containing
`package.json`—not necessarily from the current terminal directory.

Within the output directory, `aatest` preserves the source path below `src` and
changes the extension:

| Source | Generated test |
|---|---|
| `src/services/auth.ts` | `<sourceDir>/services/auth.spec.ts` |
| `src/controllers/user.js` | `<sourceDir>/controllers/user.spec.js` |

## Retry validation

Retry values must be positive integers:

```env
TEST_GEN_MAX_RETRIES=10
```

Values such as `0`, `-1`, `3.5`, an empty string, or non-numeric text stop the
command with a configuration error. The CLI logs the winning retry source.

The number is a maximum, not a required loop count. Passing validation exits
immediately.

## Secret handling

- Add `.env` and `.env.test-gen` to the target project's `.gitignore`.
- Do not paste live keys into issues, test fixtures, or generated error logs.
- Use provider keys with the smallest practical permissions and budget.
- Rotate a key immediately if it is committed or printed publicly.
