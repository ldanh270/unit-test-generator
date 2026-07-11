# Troubleshooting

Run with `--verbose` when diagnosing provider or CLI failures:

```bash
npx aatest unit src/services/auth.ts --auto-heal --verbose
```

## Configuration is not detected

`aatest` loads `.env` and `.env.test-gen` from the directory where the command
starts. Confirm the terminal location:

```powershell
Get-Location
```

Then check that the file contains `TEST_GEN_API_KEY`, `TEST_GEN_MODEL`, and
`TEST_GEN_SOURCE`, or their supported aliases. Existing shell variables override
dotenv values, so remove or update stale session variables.

## It still uses the old retry count

The CLI prints the winning retry source. To force a value for one run:

```bash
npx aatest unit src/services/auth.ts --auto-heal --retries 10
```

Confirm that the installed version is current:

```bash
npx aatest --version
npm ls @ldanh270/aatest
```

Passing tests stop early; the maximum does not require all ten attempts.

## 9Router connection fails

Check that:

- `9router` is running
- The dashboard opens at `http://localhost:20128`
- `TEST_GEN_BASE_URL` is exactly `http://localhost:20128/v1`
- The key and model ID were copied from the same dashboard
- The connected provider is healthy

## Invalid API key or insufficient credits

- HTTP 401: replace the API key.
- HTTP 402: add provider credit or switch the routed provider/model.
- HTTP 429: `aatest` waits five seconds and retries that call once; continued
  rate limiting requires waiting, changing model, or changing provider.

## Context is too large

Source content over 8,000 characters is reduced before generation. If the
provider still returns HTTP 400 or 413, split the source into smaller modules or
generate tests for a smaller exported unit.

## Jest cannot parse TypeScript or ESM

Install the missing test dependencies and verify the target project's Jest
configuration. For TypeScript, the setup expects Jest, ts-jest, and appropriate
types. ESM projects normally need a compatible Jest config and transform.

`aatest` intentionally stops healing environment failures because rewriting the
generated test cannot reliably repair project configuration.

## Jest reports no tests found

Ensure the generated output directory and `*.spec.js` or `*.spec.ts` filename
match the target project's `testMatch` or `testRegex`. Update the project config
or choose a compatible `TEST_GEN_SOURCE`.

## Validation times out

Static checks and Jest have a 60-second timeout. Common causes include:

- A test opens a real database or network connection
- An imported module starts a server
- A timer, worker, or infinite loop remains active
- A project-wide lint/typecheck script is unusually slow

Review mocks and run the logged command directly in the target project.

## Unrelated project lint errors

When only a project-wide `lint` or `typecheck` script exists, it may fail in
legacy files. `aatest` ignores that failure for healing only if the diagnostic
does not reference the generated test. The project remains unhealthy and should
still be fixed separately.

## pnpm minimum release age blocks installation

Some pnpm environments reject recently published packages or stale lockfile
entries. First inspect `pnpm-lock.yaml`. To intentionally allow a fresh package
for one installation, use the full setting name:

```bash
pnpm add -D --config.minimum-release-age=0 @ldanh270/aatest@latest
```

`--config.min-release-age=0` is not the same setting and may leave the policy
active. Do not bypass the policy unless you trust the package and expected
lockfile changes.

## Test file was replaced

Replacement is expected after generation or repair. Look beside the generated
file for a timestamped `.bak` created before the initial overwrite. Healing
updates the active generated file in place; use Git for additional history.
