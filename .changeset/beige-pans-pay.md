---
"@workflow/core": patch
---

Build the optional `@opentelemetry/api` import specifier at runtime so Rollup/Vite/Turbopack don't statically follow it. Consumers that don't install the (optional peer) dependency — e.g. the SvelteKit example, where Rollup turns unresolvable static specifiers into fatal build errors — can now build cleanly. Runtime semantics are unchanged: present → loaded; absent → caught and tracing is disabled.
