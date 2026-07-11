# Security policy

## Supported versions

Security fixes target the latest published version of `@ldanh270/aatest`.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Submit a private
security advisory through the repository's **Security** tab and include:

- Affected version
- Reproduction steps
- Expected impact
- Any suggested mitigation

## Operational security

`aatest` processes and executes sensitive project material:

- Source code, extracted structure, and validation diagnostics are sent to the
  configured OpenAI-compatible endpoint.
- Generated model output is written to disk and executed with the target
  project's Jest runtime.
- Setup can install dependencies and update `package.json`, Jest configuration,
  and `tsconfig.json` after interactive confirmation.
- Project lint/typecheck scripts may execute arbitrary commands defined by the
  target package.

Use a trusted provider, review its retention policy, run in a disposable branch
or isolated environment, inspect generated tests, and keep secrets out of source
files. Store API keys only in ignored environment files and rotate any exposed
credential immediately.
