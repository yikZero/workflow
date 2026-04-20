---
'@workflow/core': patch
---

Improve workflow runtime error logging: include error stacks in fatal and user-code errors, clarify replay-timeout messages (warn when retrying vs. error when giving up), include `workflowRunId` in suspension debug logs, and standardize the console prefix to `[workflow-sdk]`.
