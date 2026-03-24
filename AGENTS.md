# Agent Instructions

**CRITICAL RULES:**
- NEVER push directly to the `main` branch
- Do not remove or break agent-discoverable docs sitemap behavior: keep docs/app/sitemap.md/route.ts and docs/app/[lang]/sitemap.md/route.ts, and keep the sitemap link in docs/app/[lang]/llms.mdx/[[...slug]]/route.ts.

## Overview

Workflow DevKit is a durable functions framework for JavaScript/TypeScript that enables writing long-running, stateful application logic on top of stateless compute. The runtime persists progress as an event log and deterministically replays code to reconstruct state after cold starts, failures, or scale events.

This repository contains the client-side SDK code for workflows, along with example apps that showcase Workflow DevKit in action.

## Architecture

### Core Components

- **packages/core**: Core workflow runtime and primitives (`@workflow/core`)
- **packages/next**: Next.js integration (`@workflow/next`)
- **packages/cli**: Command-line interface (`@workflow/cli`)
- **packages/world**: Core interfaces and types for workflow storage backends (`@workflow/world`)
- **packages/world-local**: Filesystem-based workflow backend for local development and testing (`@workflow/world-local`)
- **packages/world-vercel**: Production workflow backend for Vercel platform deployments (`@workflow/world-vercel`)
- **packages/swc-plugin-workflow**: SWC compiler plugin for workflow transformations
- **workbench/example**: Basic workflow examples using the CLI (aka "standalone mode")
- **workbench/nextjs-turbopack**: Workflow examples using the Next.js integration

### Workflow Execution Model

Workflows consist of two types of functions:

1. **Workflow functions** (`"use workflow"`): Orchestrators that run in a sandboxed VM without full Node.js access
2. **Step functions** (`"use step"`): Individual pieces of logic with full Node.js runtime access

The framework uses compiler transformations to split workflow files into separate bundles for client, workflow, and step execution contexts.

## Development Commands

### Workspace-level Commands

```bash
# Build all packages
pnpm build

# Run tests across all packages  
pnpm test

# Run end-to-end tests
pnpm test:e2e

# Format code with Biome
pnpm format

# Lint with Biome
pnpm lint

# Typecheck TypeScript
pnpm typecheck

# Clean build artifacts
pnpm clean
```

### Core Package Testing

```bash
# Test core functionality
cd packages/core && pnpm test

# Test specific file
cd packages/core && pnpm vitest run src/[filename].test.ts

# Run E2E tests (requires environment variables and running dev server)
# Note: Use nextjs-turbopack for local e2e testing (not example app - it has no dev server)

# Step 1: Start the dev server in background
cd workbench/nextjs-turbopack && pnpm dev > /tmp/nextjs-dev.log 2>&1 &

# Step 2: Wait for server to be ready (usually 15-20 seconds)
sleep 15

# Step 3: Run the e2e tests from the project root
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" pnpm vitest run packages/core/e2e/e2e.test.ts

# Step 4: Stop the dev server when done
pkill -f "pnpm dev"

# To run specific tests, use the -t flag:
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" pnpm vitest run packages/core/e2e/e2e.test.ts -t "sleeping"

# For production testing against deployed Vercel app:
# See .github/workflows/tests.yml for required environment variables:
# - DEPLOYMENT_URL: URL of deployed app
# - APP_NAME: App name (example, nextjs-turbopack, nextjs-webpack, nitro)
# - WORKFLOW_VERCEL_ENV: Environment (production or preview)
# - WORKFLOW_VERCEL_AUTH_TOKEN: Vercel auth token
# - WORKFLOW_VERCEL_TEAM: Vercel team ID
# - WORKFLOW_VERCEL_PROJECT: Vercel project ID
```

### Example App Development

```bash
# Build workflow bundles for example app
cd workbench/example && pnpm build

# Use workflow CLI directly
cd workbench/example && pnpm workflow [command]
cd workbench/example && pnpm wf [command]  # shorthand
```

### Next.js App Development

```bash
# Start Next.js dev server with workflow support
cd workbench/nextjs-turbopack && pnpm dev

# Build Next.js app with workflows
cd workbench/nextjs-turbopack && pnpm build

# Production server
cd workbench/nextjs-turbopack && pnpm start
```

## Key Workflow Concepts

**These are only relevant when writing code using the Workflow DevKit**

- Workflow functions orchestrate step execution but have limited runtime access
- Step functions handle side effects, API calls, and complex logic with full Node.js access
- All function inputs/outputs are serialized to the event log for replay
- Built-in retry semantics for step functions with `FatalError`/`RetryableError` controls
- Standard JavaScript async patterns work: `Promise.all()`, `Promise.race()`, etc.

## File Structure Conventions

**These are only relevant when writing code using the Workflow DevKit**

- Workflow files go in `workflows/` directory (or `src/workflows/` if using src)
- Generated API routes appear in `app/.well-known/workflow/v1/` (Next.js integration)
- Workflow files must contain `"use workflow"` or `"use step"` directives to be processed
- Add `.swc` directory to `.gitignore` for SWC plugin cache artifacts

## Package Manager

This project uses pnpm with workspace configuration. The required version is specified in `package.json#packageManager`.

## Code Style

- Uses Biome for formatting and linting
- 2-space indentation, single quotes, trailing commas (ES5)
- Import type enforcement enabled
- Explicit `any` is discouraged (Biome's `noExplicitAny` rule is currently disabled); exhaustive dependencies warnings enabled

## Documentation Standards

- README.md files in each package must accurately reflect the current functionality and purpose of that package
- READMEs should not contain outdated or incorrect information about package capabilities
- When modifying package functionality, ensure corresponding README updates are included
- When modifying skill files in `skills/`, always bump the `version` field in the frontmatter metadata

## SWC Plugin

When modifying the SWC compiler plugin (`packages/swc-plugin-workflow`), you must also update the specification document at `packages/swc-plugin-workflow/spec.md` to reflect any changes to the transformation behavior.

## Changesets

- `workflow` and `@workflow/core` use changesets' "fixed" versioning strategy - they always have the same version number
- Every PR requires a changeset to be included before it will be merged
- To check if one is needed, run `pnpm changeset status --since=main >/dev/null 2>&1 && echo "no changeset needed" || echo "changeset needed"`
- Create a changeset using `pnpm changeset add`
  - All changed packages should be included in the changeset. Never include unchanged packages.
  - All changes should be marked as "patch". Never use "major" or "minor" modes.
- Remember to always build any packages that get changed before running downstream tests like e2e tests in the workbench
- Remember that changes made to one workbench should propagate to all other workbenches. The workflows should typically only be written once inside the example workbench and symlinked into all the other workbenches
- When writing changesets, use the `pnpm changeset` command from the root of the repo. Keep the changesets terse (see existing changesets for examples). Try to make changesets that are specific to each modified package so they are targeted. Ensure that any breaking changes are marked as "**BREAKING CHANGE**"

## Common Patterns

### Build-time Version Injection
Use `genversion` to access package version at runtime. See `@workflow/core` and `@workflow/world-vercel` for examples:
- Add `genversion` as devDependency
- Update build script: `genversion --es6 src/version.ts && tsc`
- Add `src/version.ts` to `.gitignore` and `turbo.json` outputs

### Turbo Caching for Generated Files
When a build step generates files, add them to the package's `turbo.json` outputs array to ensure proper caching.

## Code Review Guidelines

When reviewing PRs in this repo, always check the following areas in addition to general code quality and correctness.

### 1. Changeset Validation

- Verify a changeset is included (every PR requires one).
- Cross-reference the changeset against the actual diff: every package that was modified must be listed in the changeset. Flag any packages present in the diff but missing from the changeset.
- Changesets should not include packages that were *not* changed.
- All changes should be marked as `patch`. Flag any `major` or `minor` bumps unless the author has explicitly justified them.
- `workflow` and `@workflow/core` use fixed versioning — if one is bumped, both must be.
- Breaking changes must be called out with **BREAKING CHANGE** in the changeset summary.

### 2. Testing Story

- PRs should include adequate integration and/or e2e test coverage for the changes.
- Expanding the e2e test suite (`packages/core/e2e/e2e.test.ts`) is always preferred when possible — flag opportunities to add e2e tests even if the author only added unit tests.
- If the PR modifies runtime behavior (workflow execution, step functions, replay, serialization), there should be corresponding e2e test coverage exercising the change end-to-end.
- Check that new tests actually assert meaningful behavior and aren't just smoke tests.
- Verify tests pass locally or in CI before approving.

### 3. Backwards Compatibility

- Flag any changes that could break existing user workflows, especially:
  - Changes to public API signatures or return types
  - Changes to serialization format (affects event log replay)
  - Changes to the SWC plugin transform output
  - Removal or renaming of exported symbols
  - Changes to the `"use workflow"` / `"use step"` directive behavior
  - Changes to the HTTP API routes under `.well-known/workflow/v1/`
- The reviewer should surface these considerations explicitly so the human author/reviewer can make informed decisions. The AI reviewer should flag, not decide.

### 4. Observability / Telemetry Coverage

- If the PR adds new operations, step types, or failure modes, check whether appropriate OpenTelemetry spans, attributes, or events are emitted.
- Review `packages/core/src/observability.ts` and related telemetry code to ensure new code paths are instrumented consistently with existing patterns.
- If `hydrateResourceIO` strips fields, verify that any newly added data that should be visible in the UI is extracted before the stripping occurs.

### 5. Documentation

- A subagent should review the full docs tree (`docs/content/`) to determine if any documentation needs updating in light of the PR's changes. Key areas to check:
  - **API reference** (`docs/content/docs/api-reference/`): New or changed APIs, function signatures, options, or return types must be reflected.
  - **Foundations** (`docs/content/docs/foundations/`): Changes to core concepts like serialization, replay, hooks, or workflow/step semantics.
  - **Getting started guides** (`docs/content/docs/getting-started/`): Changes affecting framework integrations (Next.js, Astro, Nuxt, etc.).
  - **Error pages** (`docs/content/docs/errors/`): New error types or changed error behavior should have corresponding troubleshooting pages.
  - **AI docs** (`docs/content/docs/ai/`): Changes to AI-related features (DurableAgent, tool definitions, chat sessions).
  - **Observability docs** (`docs/content/docs/observability/`): Changes to telemetry or monitoring behavior.
  - **Changelog** (`docs/content/docs/changelog/`): Significant user-facing changes should be noted.
- Also check that package-level `README.md` files are updated if the package's functionality or usage changed.
- If the SWC plugin was modified, verify that `packages/swc-plugin-workflow/spec.md` is updated.

## Architecture Notes

### executionContext Field
The `executionContext` field on workflow runs is a flexible JSONB/CBOR object that can store arbitrary data without schema changes. It flows through all worlds (local, postgres, vercel).

### Observability Data Hydration
`packages/core/src/observability.ts` contains `hydrateResourceIO` which strips certain fields (like `executionContext`) before UI display. If you need to display data from stripped fields, extract it before the stripping occurs.
