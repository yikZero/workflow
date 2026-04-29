---
"@workflow/core": patch
---

Strip the trailing inline `//# sourceMappingURL=data:…` comment from the workflow bundle before evaluating it inside the QuickJS VM. The map is purely host-side metadata for `remapErrorStack` (which still uses the original, unstripped string), and QuickJS retains source text for stack-trace line lookups, so the few-MB base64 comment was bloating the VM heap and therefore every snapshot save+load. Empirical impact on the example workbench's bundle: VM heap snapshot drops from 11.75 MB → 8.00 MB (~32% reduction), saving roughly 1s per per-step round-trip on Vercel.

Also extends the `SNAPSHOT_DIAG snapshot_loaded` and `SNAPSHOT_DIAG snapshot_saved` checkpoint logs with per-stage byte counts and timings (plaintextBytes / handedToWorldBytes / loadDurationMs / decryptDurationMs / encryptDurationMs / storeDurationMs) so the savings show up directly in CI-fetched function logs alongside the existing OTel attributes.
