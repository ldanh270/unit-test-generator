# Project overview and product requirements

## Product summary

`aatest` is an npm CLI that generates Jest tests for JavaScript and TypeScript
Node.js source files. It combines static source analysis with an
OpenAI-compatible language model, then validates and optionally repairs the
generated test inside the target project.

The primary use case is backend Node.js and Express code where external
dependencies should be mocked and HTTP behavior can be tested with Supertest.

## Problem statement

Writing a useful test requires more than copying source text into a model. The
model needs export, import, route, module-system, and output-path context. The
result also needs to compile and pass the target project's actual validation
tools. When it fails, repair quality depends on current diagnostics and explicit
root-cause analysis.

## Target users

- Node.js backend developers introducing Jest coverage
- Teams maintaining Express controllers, services, and classes
- Developers using an OpenAI-compatible API or a local router such as 9Router
- Maintainers who want a bounded, inspectable test-generation workflow

## Product goals

1. Generate a complete test file for one source file per command.
2. Preserve import paths and source structure in the configured output tree.
3. Mock external I/O rather than reaching real databases, networks, or files.
4. Validate against the target project's static tooling and Jest configuration.
5. Diagnose the concrete failure before requesting a rewrite.
6. Stop immediately when validation passes.
7. Preserve the previous generated file and final failure evidence.
8. Work with any endpoint that implements the required OpenAI Chat Completions
   contract.

## Functional requirements

### Configuration

- Load `.env` and fallback `.env.test-gen` from the invocation directory.
- Require API key, model, and output directory unless a CLI override applies.
- Support canonical `TEST_GEN_*` variables and documented `AATEST_*` aliases.
- Validate retry limits as positive integers.

### Analysis and generation

- Parse JavaScript, JSX, TypeScript, decorators, imports, exported functions,
  exported classes, public methods, and common Express route declarations.
- Detect ESM and CommonJS imports heuristically.
- Calculate an exact relative import path for the generated test.
- Reduce large source input before provider submission.
- Require one fenced JavaScript or TypeScript response.

### Project setup and output

- Detect npm, pnpm, Yarn, or Bun from lockfiles.
- Offer to install missing Jest/Supertest dependencies.
- Offer compatible TypeScript Jest setup when needed.
- Write the test beneath the configured output root.
- Back up an existing test before initial replacement.

### Validation and healing

- Run the first available static check before Jest.
- Distinguish relevant generated-file failures from unrelated project failures.
- Run one Jest file in-band with a bounded timeout.
- Ask for repair consent unless automatic healing is enabled.
- Perform diagnosis and repair as separate model calls.
- End on first pass or after the configured maximum attempts.
- Save actionable failure logs after exhaustion or invalid model output.

## Non-functional requirements

- Node.js 18+ runtime
- ESM distribution bundled to a single CLI entry point
- No required global install
- No API key logging
- Deterministic configuration precedence
- A 60-second bound for each spawned static-check or Jest process
- Source-focused tests for configuration, validation, and retry behavior
- Documentation must describe actual released behavior, not planned features

## Explicitly out of scope

- Programmatic Node.js API
- Custom system prompts or templates
- Custom provider headers
- Anthropic Messages or OpenAI Responses clients
- Automatic application-code repair
- Guaranteeing semantic correctness of model-generated assertions
- Full framework coverage beyond the current Jest/Supertest-oriented prompts
- Batch generation across an entire repository

## Success criteria

- A new user can install, configure, and generate a test from README alone.
- Provider setup clearly separates local 9Router credentials from provider
  account credentials.
- `aatest --version` matches `package.json`.
- Passing validation never consumes remaining repair attempts.
- Lint, tests, and build pass before release.
- Package metadata, README, and LICENSE all report Apache-2.0.

## Product risks

| Risk | Mitigation |
|---|---|
| Sensitive source leaves the machine | Prominent provider/security documentation |
| Generated code performs unsafe work | Strong mocking prompt, isolated review guidance, bounded Jest execution |
| Setup mutates project config | Interactive confirmation and documented side effects |
| Provider compatibility varies | Document the exact Chat Completions contract |
| Model repair loops consume credit | Positive maximum retries, early stop, two-call cost warning |
| Project-wide lint is already broken | Ignore only unrelated diagnostics for healing, still warn user |
