---
"@workflow/core": patch
---

Fix webhook `respondWith: 'manual'` returning 404 after v5 version reset. The encryption capability check used `4.2.0-beta.64` as the minimum version, but the package version was reset to `4.0.0` for the v5 beta release. This caused `resumeHook` to strip the encryption key while the step handler still encrypted response data. Also stop encrypting hook metadata since the webhook handler may not have the deployment encryption key.
