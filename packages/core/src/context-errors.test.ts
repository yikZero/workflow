import { afterEach, describe, expect, it } from 'vitest';
import {
  NotInStepContextError,
  NotInWorkflowContextError,
  NotInWorkflowOrStepContextError,
  UnavailableInWorkflowContextError,
} from './context-errors.js';
import {
  WORKFLOW_CONTEXT_SYMBOL,
  type WorkflowMetadata,
} from './workflow/get-workflow-metadata.js';

// These tests assert on the plain-text form of the messages. In a TTY chalk
// would add color, but vitest runs without a TTY so chalk is level=0 and
// the styling helpers are pass-throughs. Snapshots therefore match the raw
// structure we care about (╰▶ / ├▶ tree + labels + docs URL).

describe('NotInWorkflowContextError', () => {
  it('frames the function name and docs link', () => {
    const err = new NotInWorkflowContextError(
      'createHook()',
      'createHook(): https://workflow-sdk.dev/docs/api-reference/workflow/create-hook'
    );
    expect(err.name).toBe('NotInWorkflowContextError');
    expect(err.message).toMatchInlineSnapshot(`
      "\`createHook()\` can only be called inside a workflow function
      ╰▶ note: Read more about createHook(): https://workflow-sdk.dev/docs/api-reference/workflow/create-hook"
    `);
  });
});

describe('NotInStepContextError', () => {
  it('uses "step function" phrasing', () => {
    const err = new NotInStepContextError(
      'getStepMetadata()',
      'getStepMetadata(): https://workflow-sdk.dev/docs/api-reference/workflow/get-step-metadata'
    );
    expect(err.message).toContain('can only be called inside a step function');
    expect(err.message).toContain('getStepMetadata(): https://');
  });
});

describe('NotInWorkflowOrStepContextError', () => {
  it('uses "workflow or step function" phrasing', () => {
    const err = new NotInWorkflowOrStepContextError(
      'getWorkflowMetadata()',
      'getWorkflowMetadata(): https://workflow-sdk.dev/docs/api-reference/workflow/get-workflow-metadata'
    );
    expect(err.message).toContain(
      'can only be called inside a workflow or step function'
    );
  });
});

describe('UnavailableInWorkflowContextError', () => {
  afterEach(() => {
    delete (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL];
  });

  it('names the workflow when a context is active', () => {
    (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL] = {
      workflowName: 'workflow//./src/workflows/example.ts//myWorkflow',
    } as WorkflowMetadata;

    const err = new UnavailableInWorkflowContextError(
      'resumeHook()',
      'resuming hooks: https://workflow-sdk.dev/docs/api-reference/workflow-api/resume-hook'
    );
    expect(err.message).toContain('cannot be called from a workflow context');
    expect(err.message).toContain(
      'workflow//./src/workflows/example.ts//myWorkflow'
    );
  });

  it('falls back to a generic phrasing when no context is present', () => {
    const err = new UnavailableInWorkflowContextError(
      'resumeHook()',
      'resuming hooks: https://workflow-sdk.dev/docs/api-reference/workflow-api/resume-hook'
    );
    expect(err.message).toContain('from a workflow context');
  });
});
