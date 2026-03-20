# @workflow/nest

NestJS integration for Workflow DevKit.

## Installation

```bash
npm install @workflow/nest
# or
pnpm add @workflow/nest
```

You also need to install the SWC packages required by NestJS's SWC builder:

```bash
npm install -D @swc/cli @swc/core
# or
pnpm add -D @swc/cli @swc/core
```

## Quick Start

### 1. Initialize SWC Configuration

After installing the package, run the init command to generate the SWC configuration:

```bash
npx @workflow/nest init
```

This creates a `.swcrc` file configured with the Workflow SWC plugin for client-mode transformations.

**Important:** Add `.swcrc` to your `.gitignore` as it contains machine-specific absolute paths:

```bash
echo '/.swcrc' >> .gitignore
```

### 2. Configure NestJS to use SWC

Ensure your `nest-cli.json` has SWC as the builder:

{/*@skip-typecheck: Shows nest-cli.json configuration*/}

```json
{
  "compilerOptions": {
    "builder": "swc"
  }
}
```

### 3. Import the WorkflowModule

In your `app.module.ts`:

{/*@skip-typecheck: Shows WorkflowModule import*/}

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from '@workflow/nest';

@Module({
  imports: [WorkflowModule.forRoot()],
})
export class AppModule {}
```

### 4. Create Workflow Files

Create workflow files in your `src/` directory with `"use workflow"` and `"use step"` directives:

{/*@skip-typecheck: Shows workflow file*/}

```typescript
// src/workflows/example.ts
export async function myStep(data: string) {
  'use step';
  return data.toUpperCase();
}

export async function myWorkflow(input: string) {
  'use workflow';
  const result = await myStep(input);
  return result;
}
```

### 5. Add Pre-build Scripts

Add scripts to regenerate configuration before builds:

```json
{
  "scripts": {
    "prebuild": "npx @workflow/nest init --force",
    "build": "nest build"
  }
}
```

## Configuration Options

{/*@skip-typecheck: Shows WorkflowModule.forRoot options*/}

```typescript
WorkflowModule.forRoot({
  // Directory to scan for workflow files (default: ['src'])
  dirs: ['src'],

  // Output directory for generated bundles (default: '.nestjs/workflow')
  outDir: '.nestjs/workflow',

  // Skip building in production when bundles are pre-built
  skipBuild: false,

  // SWC module type: 'es6' (default) or 'commonjs'
  // Set to 'commonjs' if your NestJS project compiles to CJS via SWC
  moduleType: 'es6',

  // Directory where NestJS compiles .ts to .js (default: 'dist')
  // Only used when moduleType is 'commonjs'
  // Should match the outDir in your tsconfig.json
  distDir: 'dist',
});
```

## Deploying to Vercel

### 1. Create an entry point

Create `api/index.js` exporting your NestJS app as a handler:

```javascript
// api/index.js
import { createApp } from '../dist/app.js';

let ready;
async function createHandler() {
  const { app } = await createApp();
  return app.getHttpAdapter().getInstance();
}

export default async (req, res) => {
  ready ??= createHandler();
  return (await ready)(req, res);
};
```

### 2. Add postbuild script

```json
{
  "scripts": {
    "prebuild": "npx @workflow/nest init --force",
    "build": "nest build",
    "postbuild": "workflow-nest build"
  }
}
```

`workflow-nest build` builds workflow bundles and, when running on Vercel, generates the [Build Output API](https://vercel.com/docs/build-output-api/v3) with queue triggers so VQS can discover your workflow consumers. The `api/index.js` entry point is auto-detected.

### 3. Configure Vercel project

Set the Framework Preset to **Other** (not "NestJS") — the NestJS preset conflicts with the Build Output API.

```json
{ "buildCommand": "pnpm build" }
```

Do **not** add `functions`, `outputDirectory`, or `rewrites` — the Build Output API handles routing.

## How It Works

The `@workflow/nest` package provides:

1. **WorkflowModule** - A NestJS module that handles workflow bundle building and HTTP routing
2. **WorkflowController** - Handles workflow and step execution requests at `.well-known/workflow/v1/`
3. **NestLocalBuilder** - Builds workflow bundles (steps.mjs, workflows.mjs) from your source files
4. **NestLocalBuilder.buildVercelOutput()** - Generates Vercel Build Output API
5. **CLI** - Generates `.swcrc` configuration with the SWC plugin properly resolved

## Why the CLI?

NestJS uses its own SWC builder that reads configuration from `.swcrc`. The Workflow SWC plugin needs to be referenced by path in this file. The CLI resolves the plugin path from `@workflow/nest`'s dependencies, eliminating the need for manual configuration or pnpm hoisting.

### Technical Details

When you run `npx @workflow/nest init`, it:

1. Resolves the path to `@workflow/swc-plugin` (bundled as a dependency of `@workflow/nest`)
2. Generates `.swcrc` with the absolute path to the plugin
3. Configures client-mode transformation for workflow files

This approach ensures:

- No manual SWC plugin configuration required
- No pnpm hoisting configuration required in `.npmrc`
- The plugin is always resolved from the correct location

### Why Workflows Must Be in `src/`

NestJS's SWC builder only compiles files within the `sourceRoot` directory (typically `src/`). For the workflow client-mode transform to work, workflow files must be in `src/` so they get compiled with the SWC plugin that attaches `workflowId` properties needed by `start()`.

## API Reference

### WorkflowModule

{/*@skip-typecheck: Shows WorkflowModule usage*/}

```typescript
import { WorkflowModule } from '@workflow/nest';

// Basic usage
WorkflowModule.forRoot()

// With options
WorkflowModule.forRoot({
  dirs: ['src/workflows'],
  outDir: '.nestjs/workflow',
  skipBuild: process.env.NODE_ENV === 'production',
  moduleType: 'commonjs',  // if using SWC CommonJS compilation
  distDir: 'dist',          // where compiled .js files live
})
```

### NestLocalBuilder.buildVercelOutput(options)

Generates the Vercel Build Output API.

{/*@skip-typecheck: Shows buildVercelOutput options*/}

```typescript
await builder.buildVercelOutput({
  // Path to your Vercel serverless function entry point (required)
  entryPoint: 'api/index.js',

  // Max duration in seconds for the NestJS function (default: 300)
  maxDuration: 300,

  // Additional routes for the Build Output API config.json
  additionalRoutes: [],
});
```

This generates:

- `.vercel/output/functions/.well-known/workflow/v1/step.func/` with `experimentalTriggers`
- `.vercel/output/functions/.well-known/workflow/v1/flow.func/` with `experimentalTriggers`
- `.vercel/output/functions/.well-known/workflow/v1/webhook/[token].func/`
- `.vercel/output/functions/api/index.js.func/` (bundled NestJS app)
- `.vercel/output/config.json` with routing rules

### CLI Commands

```bash
# Generate .swcrc configuration
npx @workflow/nest init
npx @workflow/nest init --force  # overwrite existing

# Build workflow bundles (+ Vercel Build Output API when VERCEL is set)
npx @workflow/nest build
npx @workflow/nest build --entry api/handler.js  # custom entry point
```

## License

Apache-2.0
