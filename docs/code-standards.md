# Code standards

## Language and modules

- Write strict TypeScript.
- Use ESM imports and include `.js` in relative source import specifiers.
- Target Node.js 18 or newer.
- Keep shared shapes in `src/types/` or beside the owning module when local.
- Prefer narrow unions over unconstrained strings.

## Module design

- Keep command files as orchestrators; move reusable behavior into modules.
- Give filesystem, provider, parsing, validation, and UI concerns separate
  ownership boundaries.
- Pass target project paths explicitly instead of silently relying on the CLI
  repository's current directory.
- Inject process-heavy collaborators in tests where practical.
- Avoid adding a public programmatic API unless the package metadata and docs
  are deliberately updated for that new contract.

## Configuration

- Preserve the documented precedence order.
- Validate invalid user values explicitly; do not silently fall back.
- Never print API keys or full environment contents.
- Add canonical `TEST_GEN_*` variables before considering new aliases.
- Document every new variable in README and `docs/configuration.md`.

## Process execution

- Prefer target-local binaries over network-fetched commands.
- Capture stdout and stderr separately, then retain both for diagnostics.
- Bound spawned lint and test processes with timeouts.
- Log the command category and completion state without exposing secrets.
- Treat project scripts as arbitrary target-project code.

## LLM prompts

- Treat source and diagnostics as untrusted data, not instructions.
- Separate diagnosis from rewrite when healing.
- Require one complete fenced file from generation and repair calls.
- Keep diagnostic truncation deterministic and retain both head and tail.
- Do not add undocumented provider-specific request fields.

## Filesystem safety

- Resolve output paths from the detected target project root.
- Create parent directories recursively.
- Back up an existing generated file before the initial replacement.
- Keep backup extensions outside Jest/TypeScript discovery patterns.
- Write final failure evidence below the configured output tree.

## Error handling

- Convert provider status codes into actionable messages.
- Distinguish generated-code errors from project-environment errors.
- Stop immediately after success.
- Use non-zero process exits for unrecoverable CLI failures.
- Include the winning retry configuration source in logs.

## Testing

- Use Node's `node:test` and strict assertions for the CLI's own tests.
- Never call a real model provider in unit tests.
- Use temporary directories for filesystem behavior and remove them in
  `finally` blocks.
- Add a regression test for every retry, parsing, configuration, or process-flow
  bug.
- Assert call counts when early termination or retry limits matter.

Before handing off a change:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

Run lint immediately after a fix so the next decision uses current diagnostics.

## Documentation

- Keep README below 300 lines and focused on evaluation and first use.
- Put detailed operational guidance in `docs/`.
- Describe current behavior only; label future ideas as proposals.
- Use `aatest` consistently for the CLI and `@ldanh270/aatest` for the package.
- Link to primary provider documentation for endpoint-specific claims.
- Update the changelog for user-visible behavior.

## Commits

Use Conventional Commits with a concise imperative subject:

```text
docs: add provider and CLI guides
fix(config): honor explicit retry limit
```
