---
"@workflow/core": patch
---

Fix `Promise.race(step, sleep)` semantics in V2 mixed suspensions: when a workflow suspension contains both pending steps and at least one wait (sleep), the runtime now pre-schedules a delayed self-message for the wait timeout *before* inline-executing the step. Without this, an inline step longer than the sleep would block the handler past the sleep's `resumeAt`, the wait timer would never fire on time, and replay would always resolve the race with the step. Pre-scheduling the wait continuation lets the wait timer fire in a parallel function invocation while the step is still running, restoring V1's race semantics while preserving inline step execution for the step-wins case.
