---
"@workflow/builders": minor
"@workflow/nitro": minor
---

Add a `sourcemap` builder option and matching `WORKFLOW_SOURCEMAP` environment variable that accept esbuild's sourcemap values. Setting this to `false` drops inline sourcemaps from generated bundles to reduce function size.
