---
"@workflow/web": patch
---

Move workspace `@workflow/*` packages from devDependencies to dependencies so changesets auto-bumps `@workflow/web` when its dependencies (like `@workflow/web-shared`) are released
