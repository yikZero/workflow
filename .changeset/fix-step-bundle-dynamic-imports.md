---
"@workflow/builders": patch
---

fix(builders): add `webpackIgnore` comments to dynamic imports in generated step bundle

Prevents Turbopack/webpack "Module not found" errors for runtime-resolved dynamic `import()` calls (e.g. from `@vercel/queue`) that are inlined into the step route bundle.
