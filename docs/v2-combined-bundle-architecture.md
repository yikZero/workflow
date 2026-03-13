# Eager Processing Architecture — Internal Design Document

> This document tracks the design rationale and implementation details for the eager processing architecture change. For the changelog, see `docs/content/docs/changelog/eager-processing.mdx`.

## Status: Implemented

Shipped in the `peter/v2-flow` branch. All framework builders updated.

## Summary

The previous architecture used two separate routes: `/v1/flow` for workflow replay (VM) and `/v1/step` for step execution (Node.js). Each step required 2 queue messages and 2 function invocations. The new architecture merges both into a single `/v1/flow` route using `workflowEntrypoint()`, which executes steps inline when possible.

A serial 10-step workflow now completes in 1 function invocation instead of 21.

## Key Implementation Decisions

1. **No SWC plugin changes** — two-pass build (step bundle + workflow VM string) still works. Only the route wiring changed.
2. **Background steps don't replay inline** — when a background step message arrives (with `stepId`), execute the step then queue a plain workflow continuation. The step events must be processed by the workflow's event subscriptions during replay.
3. **Incremental event loading** — the event log is cached in memory across loop iterations. Only new events are fetched on subsequent replays using cursor-based pagination.
4. **Same `v1` path prefix** — avoids breaking manifest URLs, webhook paths, and queue topic routing.

## Files Changed

| Package | File | Change |
|---------|------|--------|
| `@workflow/world` | `queue.ts` | Added optional `stepId` to `WorkflowInvokePayload` |
| `@workflow/core` | `runtime.ts` | `workflowEntrypoint()` now uses inline execution loop |
| `@workflow/core` | `runtime/step-executor.ts` | **New** — reusable step execution logic |
| `@workflow/core` | `runtime/suspension-handler.ts` | `handleSuspension()` returns pending steps instead of queuing them |
| `@workflow/core` | `runtime/helpers.ts` | Added `getAllWorkflowRunEventsWithCursor()` and `getNewWorkflowRunEvents()` |
| `@workflow/builders` | `base-builder.ts` | Added `createCombinedBundle()` |
| `@workflow/builders` | `constants.ts` | `WORKFLOW_QUEUE_TRIGGER` now covers both workflow and step execution |
| All framework packages | builders | Use `createCombinedBundle()` instead of separate step + workflow bundles |

## Companion Changes

- **workflow-server** (`peter/fix-end-cursor`): `queryByRunId` now returns a cursor even on the final page, enabling incremental event loading.

## Known Issues

### step_started does not reject already-running steps

`step_started` in workflow-server uses a WHERE clause that only rejects terminal states (`completed`, `failed`, `cancelled`). It does **not** reject `running` — it succeeds and increments the attempt counter. This means multiple concurrent invocations can all start and execute the same step simultaneously after parallel step convergence.

This causes:
- Redundant step execution (wasted compute, though harmless if steps are idempotent)
- Attempt counter inflation (could trigger premature "exceeded max retries")

**Fix**: Add `ne(status, 'running')` to the `handleStepStarted` WHERE clause in `workflow-server/lib/data/events.ts`. This needs careful handling of the retry-after-SIGKILL case where a step was killed mid-execution and needs to be re-started by the queue.
