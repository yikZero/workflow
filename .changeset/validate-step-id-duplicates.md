---
"@workflow/builders": patch
---

Generate per-file IDs for non-exported workspace package files (previously they collapsed to `name@version`, silently overwriting same-named steps/workflows across files) and fail the build when two transformed files emit the same step or workflow ID.
