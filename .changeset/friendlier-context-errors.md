---
'@workflow/core': patch
'@workflow/errors': patch
---

Introduce structured, actionable error messages for context-violation errors.

Adds a new `Ansi` rendering helper on `@workflow/errors` (`Ansi.frame`, `Ansi.hint`, `Ansi.note`, `Ansi.help`, `Ansi.code`, `Ansi.inline`) for composing terminal-friendly, box-drawn error messages.

Adds four new error classes on `@workflow/core`:

- `NotInWorkflowContextError` — thrown when an API must run inside a workflow (e.g. `createHook()`, `sleep()`).
- `NotInStepContextError` — thrown when an API must run inside a step (e.g. `getStepMetadata()`).
- `NotInWorkflowOrStepContextError` — thrown when an API must run inside either (e.g. `getWorkflowMetadata()`, `getWritable()`).
- `UnavailableInWorkflowContextError` — thrown when an API MUST NOT run inside a workflow (e.g. `resumeHook()`, `defineHook().resume()`), and names the active workflow for context.

Each error now includes a docs link and a human-readable framing:

```
`createHook()` can only be called inside a workflow function
╰▶ note: Read more about createHook(): https://workflow-sdk.dev/docs/api-reference/workflow/create-hook
```

Applied to all twelve context-violation sites in `@workflow/core`: `createHook`, `createWebhook`, `defineHook().create`, `defineHook().resume`, `sleep`, `getStepMetadata`, `getWorkflowMetadata` (both overloads), `getWritable`, `resumeHook`, and the workflow-VM stubs.
