---
"@workflow/core": patch
---

Fix `MODULE_NOT_FOUND: './world.js'` thrown from `start()` and other V2 entry points when the route is bundled and `getWorld()` has never been called on the current instance. `runtime/world.ts` now registers `getWorld` on `globalThis` at module load, and `getWorldLazy` prefers that registered function over its `import('./world.js')` fallback (which fails after Next.js inlines `get-world-lazy.js` into a route bundle, since no sibling `world.js` exists at the bundled location).
