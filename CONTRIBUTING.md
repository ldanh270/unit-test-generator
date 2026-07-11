# Contributing to aatest

Thank you for improving `aatest`. Keep changes focused, testable, and aligned
with the CLI's current public behavior.

## Development setup

```bash
git clone https://github.com/ldanh270/unit-test-generator.git
cd unit-test-generator
pnpm install
pnpm lint
pnpm test
pnpm build
```

Node.js 18 or newer and pnpm are recommended.

## Workflow

1. Create a focused branch.
2. Add or update tests for behavioral changes.
3. Run `pnpm lint` before using failure output to guide a fix.
4. Run `pnpm test` and `pnpm build`.
5. Update README or `docs/` when public behavior changes.
6. Use a Conventional Commit message.

Example:

```text
fix(heal): stop retrying after tests pass
```

## Pull requests

Include:

- The problem being solved
- The relevant design or behavior change
- Verification commands and results
- Any configuration, compatibility, or security impact

Do not include API keys, generated tests from private projects, or private
source snippets in fixtures, logs, screenshots, or issues.

## Code standards

See [docs/code-standards.md](docs/code-standards.md) for TypeScript, module,
error-handling, and testing conventions.

## Reporting issues

Use [GitHub Issues](https://github.com/ldanh270/unit-test-generator/issues) for
reproducible bugs and feature proposals. Use a private GitHub security advisory
for vulnerabilities; see [SECURITY.md](SECURITY.md).
