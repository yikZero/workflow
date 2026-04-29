---
"@workflow/core": patch
---

Move snapshot compression into core, with zstd/gzip codec selection. New `serialization/compression.ts` module exposes `compress` / `decompress` / `isCompressed` / `PREFERRED_CODEC` helpers that wrap payloads with format-prefixed gzip or zstd (Node 22.15+) blobs. The snapshot save pipeline is now `serialize → compress → encrypt → store`; load is the inverse. Compressing BEFORE encryption is the correct order (encryption produces ~random bytes that don't compress, so doing it the other way around was wasted CPU).

zstd is preferred when available — benchmarked against an 8 MB QuickJS heap snapshot it's both faster (~7x compress, ~2x decompress) and slightly smaller than gzip-default. Falls back to gzip on Node 18/20. Format prefix on each blob marks the codec so deployments running different Node versions remain interoperable.

Adds 24 new unit tests covering round-trip semantics, idempotency, codec selection, the full save/load pipeline (with and without encryption), and backward-compat for legacy snapshots written before compression was added.
