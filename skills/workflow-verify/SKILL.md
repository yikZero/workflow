---
name: workflow-verify
description: Turn a workflow blueprint into implementation-ready file lists, test matrices, integration test skeletons, and runtime verification commands. Use when the user is ready to implement and test a designed workflow. Triggers on "verify workflow", "workflow tests", "implement blueprint", or "workflow-verify".
metadata:
  author: Vercel Inc.
  version: '0.5'
---

# workflow-verify

Use this skill when the user wants implementation-ready verification from a workflow blueprint.

## Skill Loop Position

**Stage 4 of 4** in the workflow skill loop: teach → design → stress → **verify**

| Stage | Skill | Purpose |
|-------|-------|---------|
| 1 | workflow-teach | Capture project context |
| 2 | workflow-design | Emit a WorkflowBlueprint |
| 3 | workflow-stress | Pressure-test the blueprint |
| **4** | **workflow-verify** (you are here) | Generate test matrices and verification artifacts |

**Prerequisite:** A blueprint from `workflow-design`, ideally stress-tested by `workflow-stress`.
**Next:** Implement the workflow and run the generated tests.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source.
2. **`lib/ai/workflow-blueprint.ts`** — the `WorkflowBlueprint` type contract.
3. **`.workflow-skills/context.json`** if it exists — project context from the teach stage.
4. **The current workflow blueprint** — the original or a stress-patched version, either from the conversation or from `.workflow-skills/blueprints/*.json`.
5. **The `WorkflowVerificationPlan` contract** — defined in `lib/ai/workflow-verification.ts`.

## Verification Artifact Contract

Create `.workflow-skills/verification/<workflow-name>.json` with this exact shape:

```json
{
  "contractVersion": "1",
  "blueprintName": "<blueprint.name>",
  "files": [
    { "path": "<path>", "kind": "workflow", "purpose": "<purpose>" }
  ],
  "testMatrix": [
    { "name": "<test name>", "helpers": ["start"], "verifies": ["<assertion>"] }
  ],
  "runtimeCommands": [
    { "name": "<name>", "command": "<shell command>", "expects": "<expected outcome>" }
  ],
  "implementationNotes": ["<note>"]
}
```

Rules:

- `blueprintName` must equal `blueprint.name`.
- `files` must include exactly one workflow file, one route file, and one test file.
- The route file must come from `blueprint.trigger.entrypoint`.
- The test matrix must be copied from `blueprint.tests`.
- `implementationNotes` must carry forward `invariants`, `operatorSignals`, and `compensationPlan`.
- If `.workflow-skills/context.json` shows `src/workflows/` in `canonicalExamples`, use `src/workflows/<name>.ts`; otherwise use `workflows/<name>.ts`.

## Output Sections

Output exactly these sections in order:

### `## Files to Create`

A table of every file that needs to be created or modified to implement the workflow:

| File | Purpose |
|------|---------|
| `workflows/<name>.ts` | Workflow function with `"use workflow"` and step functions with `"use step"` |
| `app/api/...` | API route or trigger entrypoint |
| `__tests__/<name>.test.ts` | Integration tests using `@workflow/vitest` |
| ... | ... |

Include the `"use workflow"` and `"use step"` directive placement for each workflow file.

### `## Test Matrix`

A table mapping each test from the blueprint to what it verifies and which helpers it uses:

| Test Name | Helpers Used | Verifies |
|-----------|-------------|----------|
| ... | `start`, `waitForHook`, `resumeHook`, ... | ... |

Also translate blueprint policy arrays into verification work:

- `invariants` → add assertions that impossible terminal states and duplicate side effects cannot occur.
- `compensationPlan` → add at least one failure-path test or one explicit manual/runtime verification step per compensation entry.
- `operatorSignals` → add stream/log assertions or runtime verification commands showing how each required signal is observed.

### `## Integration Test Skeleton`

A complete, runnable TypeScript test file using `vitest` and `@workflow/vitest`. Apply these rules based on what the blueprint contains:

#### Hook rules
- If the blueprint contains a **hook** suspension, use `waitForHook()` to wait for the workflow to reach the hook, then `resumeHook()` to provide the payload and advance the workflow.

#### Webhook rules
- If the blueprint contains a **webhook** suspension, use `waitForHook()` to wait for the webhook to be registered, then `resumeWebhook()` to simulate an incoming webhook request.

#### Sleep rules
- If the blueprint contains a **sleep** suspension, use `waitForSleep()` to wait for the workflow to enter the sleep, then `getRun(runId).wakeUp({ correlationIds })` to advance past it.

#### General rules
- Always use `start()` to launch the workflow under test.
- Always assert on `run.returnValue` to verify the workflow's final output.
- Import from `workflow/api` for runtime functions (`start`, `getRun`, `resumeHook`, `resumeWebhook`).
- Import from `@workflow/vitest` for test utilities (`waitForHook`, `waitForSleep`).
- Prefer `@workflow/vitest` integration tests over manual QA or unit tests with mocks.

#### Skeleton template

When a hook and sleep are both present:

```ts
import { describe, it, expect } from 'vitest';
import { start, getRun, resumeHook } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import { myWorkflow } from './my-workflow';

describe('myWorkflow', () => {
  it('completes the happy path', async () => {
    const run = await start(myWorkflow, [/* inputs */]);

    // Wait for hook suspension
    await waitForHook(run, { token: 'expected-token' });
    await resumeHook('expected-token', { /* payload */ });

    // Wait for sleep suspension
    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });

    // Verify final output
    await expect(run.returnValue).resolves.toEqual({
      /* expected return value */
    });
  });
});
```

When a webhook is present:

```ts
import { describe, it, expect } from 'vitest';
import { start, resumeWebhook } from 'workflow/api';
import { waitForHook } from '@workflow/vitest';
import { myWorkflow } from './my-workflow';

describe('myWorkflow', () => {
  it('handles webhook ingress', async () => {
    const run = await start(myWorkflow, [/* inputs */]);

    // Wait for webhook registration
    const hook = await waitForHook(run);

    await resumeWebhook(
      hook.token,
      new Request('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /* webhook payload */ }),
      })
    );

    await expect(run.returnValue).resolves.toEqual({
      /* expected return value */
    });
  });
});
```

### `## Runtime Verification Commands`

Shell commands to verify the workflow works end-to-end in a local development environment:

```bash
# Start the dev server
cd workbench/nextjs-turbopack && pnpm dev

# Run integration tests
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" \
  pnpm vitest run __tests__/<workflow-name>.test.ts

# Run with specific test filter
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" \
  pnpm vitest run __tests__/<workflow-name>.test.ts -t "happy path"
```

Include workflow-specific commands for any manual verification steps (e.g. triggering a webhook via `curl`, inspecting run state via CLI).

### `## Verification Artifact`

Include a fenced `json` block that exactly matches the contents of
`.workflow-skills/verification/<workflow-name>.json`. This lets both humans and
downstream tooling parse the plan without reading the file.

## Hard Rules

- If the blueprint contains a hook, the test **must** use `waitForHook()` and `resumeHook()`.
- If the blueprint contains a webhook, the test **must** use `waitForHook()` and `resumeWebhook()`.
- If the blueprint contains a sleep, the test **must** use `waitForSleep()` and `getRun(runId).wakeUp({ correlationIds })`.
- Every test **must** use `start()` to launch the workflow.
- Every test **must** assert on `run.returnValue` for the final output.
- Workflow functions orchestrate only — no side effects.
- All I/O lives in `"use step"`.
- `createHook()` supports deterministic tokens; `createWebhook()` does not.
- Stream I/O happens in steps only.
- `FatalError` and `RetryableError` recommendations must be intentional.
- When the blueprint contains `invariants`, include assertions that those invariants still hold in both happy-path and failure-path coverage.
- When the blueprint contains `compensationPlan`, include failure-path coverage or explicit runtime verification steps proving each compensation path is exercised or observable.
- When the blueprint contains `operatorSignals`, include stream/log assertions or runtime verification commands for each required operator signal.

## Sample Usage

**Input:** `Generate verification artifacts for the document-approval workflow blueprint.`

**Expected output:** A files-to-create table, a test matrix mapping each blueprint test to helpers and assertions, a complete integration test skeleton using `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`, `start()`, and `run.returnValue`, and runtime commands for local testing.
