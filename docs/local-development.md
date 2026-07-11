# Local development

## Prerequisites

- Node.js 18 or newer
- pnpm
- Git

## Install and verify

```bash
git clone https://github.com/ldanh270/unit-test-generator.git
cd unit-test-generator
pnpm install
pnpm lint
pnpm test
pnpm build
```

The verification commands are:

| Command | Purpose |
|---|---|
| `pnpm lint` | Type-check source with `tsc --noEmit` |
| `pnpm test` | Run Node's test runner against the TypeScript test suite |
| `pnpm build` | Bundle the ESM CLI to `dist/index.js` with tsup |

Run lint first after each fix so its current output drives the next change.

## Run source directly

```bash
pnpm dev -- --help
pnpm dev -- unit path/to/source.ts --dry-run
```

The current working directory controls configuration loading. To target another
project while using source directly, start the command from that project and
pass the source entry point explicitly:

```powershell
node C:\path\to\unit-test-generator\dist\index.js unit src\services\auth.ts --dry-run
```

Build first whenever source changed.

## Test a local package build

Create a package tarball:

```bash
pnpm build
pnpm pack
```

Install the generated `.tgz` in a disposable target project:

```bash
pnpm add -D C:\path\to\ldanh270-aatest-X.Y.Z.tgz
pnpm exec aatest --version
```

This exercises the same `files: ["dist"]` package shape that npm users receive.

For faster iteration without installing, run the built entry point directly as
shown above.

## Release checklist

1. Update the package version and changelog.
2. Run `pnpm lint`, `pnpm test`, and `pnpm build`.
3. Run `pnpm pack` and inspect the tarball contents.
4. Install the tarball in a clean JavaScript or TypeScript fixture project.
5. Verify `aatest --version`, `aatest --help`, `init`, dry-run, generation, and
   healing.
6. Confirm package metadata and Apache-2.0 license.
7. Publish using the repository's approved npm release process.

Do not publish from a dirty worktree or with real provider keys in tracked files.
