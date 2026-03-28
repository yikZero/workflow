---
name: workflow-observe
description: Build a durable workflow with operator-visible progress, namespaced streams, and terminal signals. Use when the user says "observability workflow", "workflow-observe", "operator signals", "stream logs", or "progress visibility".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-observe

Use this skill when the user wants to build a workflow where operator visibility is a first-class concern — progress streams, namespaced log channels, and terminal signals that allow operators to diagnose failures without accessing the runtime directly. This is a scenario entrypoint that routes into the existing teach → build pipeline with observability-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these observability-specific questions before proceeding:

1. **Operator audience** — "Who consumes the stream output: a dashboard, CLI, monitoring system, or all three?"
2. **Progress granularity** — "What progress events do operators need to see (e.g. rows processed, steps completed, percentage)?"
3. **Stream namespaces** — "Does the workflow need multiple stream channels (e.g. progress, errors, diagnostics) or a single unified stream?"
4. **Terminal signals** — "What must the final output contain so an operator knows the workflow succeeded, failed, or was cancelled?"
5. **Structured log format** — "Should stream events be structured JSON, key=value pairs, or human-readable text?"
6. **Failure diagnostics** — "When a step fails, what contextual data must be in the stream for operators to diagnose without runtime access?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building an operator-observable workflow, the following constraints are non-negotiable:

### Stream namespace separation

Use distinct stream namespaces to separate concerns. At minimum:

- **`progress`** — operator-facing progress updates (items processed, percentage, stage transitions)
- **`errors`** — validation errors, step failures, diagnostic context
- **`status`** — terminal signals: workflow completed, failed, or cancelled with summary data

Each namespace must be addressable independently so operators can subscribe to only the channels they need.

### Stream I/O placement

`getWritable()` may be called in workflow context to obtain a stream handle, but all actual `write()` calls must happen inside `"use step"` functions. This is a hard runtime constraint.

### Structured stream events

Every stream event must be structured (JSON or key=value) so downstream consumers can parse and aggregate without regex. Include at minimum:

- `event` — the event type (e.g. `progress`, `step.started`, `step.completed`, `workflow.failed`)
- `timestamp` — ISO 8601 timestamp
- `data` — event-specific payload

### Terminal signals

The workflow must emit a terminal signal on every exit path:

- **Success:** `{ "event": "workflow.completed", "status": "success", ... }`
- **Failure:** `{ "event": "workflow.failed", "status": "error", "error": "...", ... }`
- **Partial:** `{ "event": "workflow.completed", "status": "partial", "completed": [...], "failed": [...] }`

Operators must never have to guess whether a workflow is still running or has finished.

### Operator-queryable state

Step functions that emit stream events must include enough context for an operator to understand the current state without seeing the full event history. Each progress event should be self-describing (include total, processed, remaining — not just a delta).

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, stream namespace allocation, progress emission points
2. **Flag relevant traps** — run the stress checklist with special attention to stream I/O placement, namespace separation, and terminal signal coverage
3. **Decide failure modes** — ensure every failure path emits a terminal signal before throwing
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code, verify all exit paths emit terminal signals
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path with stream verification** — workflow completes, progress stream contains expected events, terminal signal is `workflow.completed`
- **Failure path with terminal signal** — step fails, error stream contains diagnostic context, terminal signal is `workflow.failed`
- **Namespace isolation** — progress events appear only in the progress namespace, errors only in the error namespace

## Anti-Patterns

Flag these explicitly when they appear in the workflow:

- **Stream writes in workflow context** — `write()` calls must happen in `"use step"` functions, not in the `"use workflow"` orchestrator
- **Missing terminal signal** — every exit path (success, failure, partial) must emit a terminal signal; silent exits are invisible to operators
- **Unstructured stream output** — free-text log lines cannot be parsed by downstream consumers; use structured JSON or key=value
- **Single namespace for all events** — mixing progress, errors, and status in one namespace forces operators to filter manually
- **Delta-only progress events** — operators joining mid-stream cannot reconstruct state; include cumulative totals in each event
- **Node.js APIs in workflow context** — `fs`, `crypto`, `Buffer`, etc. cannot be used inside `"use workflow"` functions
- **`start()` called directly from workflow code** — must be wrapped in a step

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source
2. **`.workflow.md`** — project-specific context (if present)

## Verification Contract

This skill terminates with the same verification contract as `workflow-build`. The final output must include:

1. A **Verification Artifact** — fenced JSON block with `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`
2. A **Verification Summary** — single-line JSON: `{"event":"verification_plan_ready","blueprintName":"<name>","fileCount":<n>,"testCount":<n>,"runtimeCommandCount":<n>,"contractVersion":"1"}`

## Sample Usage

**Input:** `/workflow-observe Stream operator progress, namespaced logs, and terminal status for a long-running backfill workflow.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: ingestion step with progress stream emissions, validation step with error stream emissions, load step with progress updates, summary step with terminal signal — each using `getWritable()` in workflow context and `write()` in step context
3. Flags: stream I/O must happen in steps, namespace separation required, terminal signal on every exit path, structured events with cumulative totals
4. Writes: `workflows/backfill-pipeline.ts` + `workflows/backfill-pipeline.integration.test.ts`
5. Tests cover: happy path with stream event assertions, failure path with terminal signal verification, namespace isolation
6. Emits verification artifact and `verification_plan_ready` summary
