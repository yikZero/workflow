---
---

Remove `e2e-community` from the list of required CI checks. The job still runs and posts a warning on failure, but no longer blocks merges on `stable` — community worlds are maintained externally, so cross-repo breakage shouldn't gate the release branch.
