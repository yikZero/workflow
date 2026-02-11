# @workflow/next

Next.js integration for Workflow DevKit.

## Install

```bash
npm install workflow next
# or
pnpm add workflow next
# or
yarn add workflow next
# or
bun add workflow next
```

`next` is a peer dependency. `workflow` includes this package as `workflow/next`.

## Usage

Wrap your Next config with `withWorkflow()`.

```ts
import type { NextConfig } from 'next';
import { withWorkflow } from '@workflow/next';

const nextConfig: NextConfig = {
  // your Next.js config
};

export default withWorkflow(nextConfig);
```

### Type signature

```ts
import type { NextConfig } from 'next';

export declare function withWorkflow(
  nextConfigOrFn:
    | NextConfig
    | ((
        phase: string,
        ctx: { defaultConfig: NextConfig }
      ) => Promise<NextConfig>),
  {
    workflows,
  }?: {
    workflows?: {
      local?: {
        port?: number;
        dataDir?: string;
      };
    };
  }
): (
  phase: string,
  ctx: { defaultConfig: NextConfig }
) => Promise<NextConfig>;
```

### Example: object config

```ts
import type { NextConfig } from 'next';
import { withWorkflow } from '@workflow/next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withWorkflow(nextConfig, {
  workflows: {
    local: {
      port: 3152,
    },
  },
});
```

### Example: async config function

```ts
import type { NextConfig } from 'next';
import { withWorkflow } from '@workflow/next';

export default withWorkflow(async (phase, { defaultConfig }) => {
  const nextConfig: NextConfig = {
    ...defaultConfig,
    reactStrictMode: true,
  };

  if (phase === 'phase-production-build') {
    nextConfig.productionBrowserSourceMaps = true;
  }

  return nextConfig;
});
```

## What `withWorkflow()` does

When you wrap your config, `withWorkflow()`:

1. Sets runtime defaults for local and Vercel worlds.
2. Registers the Workflow loader in both Turbopack and webpack.
3. Builds generated workflow routes in `.well-known/workflow/v1/*`.
4. Watches source files in development and incrementally rebuilds bundles.
5. Avoids duplicate builder runs per process using `WORKFLOW_NEXT_PRIVATE_BUILT`.

## Environment variables

| Variable | Used by | Behavior |
| --- | --- | --- |
| `WORKFLOW_TARGET_WORLD` | `withWorkflow()` + runtime world selection | If not set: defaults to `local` when not on Vercel, and `vercel` when `VERCEL_DEPLOYMENT_ID` is present. |
| `WORKFLOW_LOCAL_DATA_DIR` | Local world runtime | Set to `.next/workflow-data` by `withWorkflow()` when defaulting to local world. You can override it explicitly in your environment. |
| `PORT` | Next dev/build process | Set from `workflows.local.port` when running outside Vercel. |
| `WORKFLOW_NEXT_PRIVATE_BUILT` | `withWorkflow()` internals | Internal guard to ensure builder setup runs once per main process. |
| `WORKFLOW_PUBLIC_MANIFEST` | Builder/public output | When set to `1`, copies `manifest.json` to `public/.well-known/workflow/v1/manifest.json` so Next serves it publicly. |
| `WATCHPACK_WATCHER_LIMIT` | Watch mode on macOS | Set to `20` during dev watch mode on Darwin to mitigate slow watcher teardown behavior. |

## Package exports

| Export path | Description |
| --- | --- |
| `@workflow/next` | Main Next integration export. Provides `withWorkflow()`. |
| `@workflow/next/loader` | Loader that applies Workflow client-mode transforms for `"use workflow"` and `"use step"`. |
| `@workflow/next/runtime` | Re-export of `@workflow/core/dist/runtime` for runtime compatibility. |

If you install the umbrella `workflow` package, these are available from `workflow/next` and related subpaths.

## Generated `.well-known/workflow/v1/*` files

`@workflow/next` generates these files under your app directory (`app/` or `src/app/`):

| File | Purpose | Public route |
| --- | --- | --- |
| `.well-known/workflow/v1/flow/route.js` | Workflow orchestration handler bundle. | `POST /.well-known/workflow/v1/flow` |
| `.well-known/workflow/v1/step/route.js` | Step execution handler bundle. | `POST /.well-known/workflow/v1/step` |
| `.well-known/workflow/v1/webhook/[token]/route.js` | Webhook delivery handler bundle. | `POST /.well-known/workflow/v1/webhook/:token` |
| `.well-known/workflow/v1/manifest.json` | Workflow/step/class manifest (with graph metadata). | Not public unless `WORKFLOW_PUBLIC_MANIFEST=1` |
| `.well-known/workflow/v1/config.json` | Production function trigger config for Next build output. | Internal build artifact |
| `.well-known/workflow/v1/.gitignore` | Prevents committing generated artifacts. | N/A |

If your app uses `pages/` only, the builder creates a sibling `app/` (or `src/app/`) directory for generated routes.

## How generated files work at runtime

1. Your app calls `start()` with a transformed workflow function.
2. Runtime posts to `/.well-known/workflow/v1/flow` to advance orchestration.
3. Steps execute through `/.well-known/workflow/v1/step`.
4. Webhook resumptions arrive through `/.well-known/workflow/v1/webhook/:token`.
5. Manifest metadata is used by tooling and can be exposed for observability.

## Serving the manifest publicly

To expose the manifest over HTTP, set:

```bash
WORKFLOW_PUBLIC_MANIFEST=1
```

On build, `@workflow/next` copies:

- From: `app/.well-known/workflow/v1/manifest.json` (or `src/app/...`)
- To: `public/.well-known/workflow/v1/manifest.json`

Next.js then serves it at:

- `/.well-known/workflow/v1/manifest.json`

## Troubleshooting

### `'start' received an invalid workflow function`

- Ensure your workflow function has `"use workflow"`.
- Ensure step functions use `"use step"` where required.
- Ensure `next.config.*` is wrapped with `withWorkflow()`.

### Workflow routes return 404

- Confirm one of these exists: `app/`, `src/app/`, `pages/`, or `src/pages/`.
- Confirm generated files exist under `.well-known/workflow/v1/*`.
- If using a Next proxy handler, exclude `/.well-known/workflow/` paths.

### Manifest route is missing

- Set `WORKFLOW_PUBLIC_MANIFEST=1` before running/building.
- Rebuild so `manifest.json` is copied into `public/.well-known/workflow/v1/`.

### Next.js 16.1+ build error

If you see:

```text
Error: Cannot find module 'next/dist/lib/server-external-packages.json'
```

Upgrade to `workflow@4.0.1-beta.26` or newer.
