# aatest documentation

This directory is the source of truth for `aatest` behavior, configuration,
operations, and maintenance.

## User guides

| Guide | Purpose |
|---|---|
| [Getting started](getting-started.md) | Install, initialize, and generate a first test |
| [Providers](providers.md) | Configure 9Router and other OpenAI-compatible endpoints |
| [Configuration](configuration.md) | Environment variables, aliases, and precedence |
| [CLI reference](cli-reference.md) | Commands, options, side effects, and examples |
| [Self-healing](self-healing.md) | Validation order, retries, diagnosis, and repair |
| [Troubleshooting](troubleshooting.md) | Resolve provider, Jest, lint, and package-manager errors |
| [Local development](local-development.md) | Build, test, pack, and run the CLI locally |

## Maintainer reference

| Document | Purpose |
|---|---|
| [Project overview and PDR](project-overview-pdr.md) | Product scope, requirements, and constraints |
| [Codebase summary](codebase-summary.md) | Modules and ownership boundaries |
| [Code standards](code-standards.md) | TypeScript and contribution conventions |
| [System architecture](system-architecture.md) | End-to-end pipeline and runtime decisions |

Historical phase specifications were removed because they described legacy
branding and behavior that no longer matched the published CLI.
