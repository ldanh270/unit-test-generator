# Validation and self-healing

Self-healing is a bounded diagnose-and-repair loop. It does not blindly rewrite
the test a fixed number of times.

## Validation always runs

After writing a generated test, `aatest` performs an initial validation even
when `--auto-heal` is absent. `--auto-heal` only skips the confirmation prompt
that appears after a failure.

## Static-check selection

The CLI selects the first available check:

1. Local ESLint binary, scoped to the generated file
2. Local Biome binary, scoped to the generated file
3. Target package `lint` script
4. Target package `typecheck` script
5. No static check, with a warning

Only one static check runs. A relevant failure is returned to the repair loop
before Jest runs.

Package scripts are project-wide. If their output fails but does not mention the
generated test's absolute or relative path, `aatest` reports the unrelated
failure and continues to Jest.

## Jest isolation

The generated file runs through the target project's local Jest binary when
available. The command includes:

```text
--runInBand --no-coverage --colors=false --forceExit
```

Jest and static checks each have a 60-second process timeout. Jest configuration
is detected from common `.js`, `.cjs`, `.mjs`, `.ts`, and `.cts` filenames; ESM
projects prefer a CommonJS-compatible config when available.

## Repair loop

For each failed attempt:

1. Read the current generated test.
2. Combine stderr and stdout while retaining the beginning and end of long
   diagnostics.
3. Ask the model for a concise root-cause analysis without code.
4. Ask the model for one complete corrected test file using that diagnosis.
5. Require exactly one JavaScript or TypeScript code block.
6. Write the corrected file.
7. Run static validation and Jest again.
8. Stop immediately when validation passes.

An attempt can therefore consume two model calls. Budget provider usage for up
to `2 × maxRetries` repair calls in addition to the initial generation call.

HTTP 429 handling is separate: a rate-limited provider call waits five seconds
and retries once.

## Retry semantics

`TEST_GEN_MAX_RETRIES=10` means at most ten repairs after the initial failed
validation. It does not mean ten validations must run.

```text
Initial validation fails
Attempt 1 fails
Attempt 2 fails
Attempt 3 fails
Attempt 4 passes
Stop; attempts 5-10 are not called
```

## Failures not repaired by the model

The CLI stops and asks for project-level changes when diagnostics indicate:

- Jest cannot parse TypeScript or ESM
- The test command or binary is missing
- Jest reports no matching tests
- The generated file cannot be read
- The provider call fails

These failures generally require dependency, Jest, module-system, or test-match
configuration changes rather than another generated-code rewrite.

## Exhausted retries

When all attempts fail, the latest code and diagnostics are saved under:

```text
<sourceDir>/.test-gen-errors/
```

The generated test remains in place for manual debugging. A parse failure can
also produce an error log containing the raw invalid model response.
