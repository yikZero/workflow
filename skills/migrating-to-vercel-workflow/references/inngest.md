# Inngest -> Vercel Workflow

## Map these constructs

| Inngest | Vercel Workflow |
| --- | --- |
| `inngest.createFunction()` | `"use workflow"` + `start()` |
| `step.run()` | `"use step"` |
| `step.sleep()` / `step.sleepUntil()` | `sleep()` |
| `step.waitForEvent()` | `createHook()` or `createWebhook()` |
| timeout on `step.waitForEvent()` | `Promise.race()` + `sleep()` |
| `step.invoke()` | step-wrapped `start()` / `getRun()` |
| `inngest.send()` / event triggers | app-boundary `start()` |
| `step.sendEvent()` | step-wrapped `start()` fan-out |
| `step.realtime.publish()` | `getWritable()` |

## Remove

- Inngest client setup (`new Inngest(...)`)
- `serve()` handler and function registration
- Event-schema dispatch layer and event type definitions used only for routing
- Inline `step.run()` closures after extracting them into named `"use step"` functions
- `step.waitForEvent()` match expressions — hook tokens replace event matching

## Add

- `Promise.race()` with `sleep()` when the source used timeout-based waits on `step.waitForEvent()`
- Hook resume endpoint — `createHook()` in workflow, `resumeHook()` in an API route
- Durable progress writes with `getWritable()` (replaces `step.realtime.publish()`)
- Idempotency keys on external writes via `getStepMetadata().stepId`
- Rollback stack for compensation-heavy flows (replaces per-step try/catch compensation)
- Step-wrapped `start()` / `getRun()` for child workflows (replaces `step.invoke()`)
