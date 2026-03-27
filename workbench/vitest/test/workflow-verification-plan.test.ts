import { describe, expect, it } from 'vitest';
import type {
  WorkflowBlueprint,
  WorkflowContext,
} from '../../../lib/ai/workflow-blueprint';
import {
  createWorkflowVerificationPlan,
  inferWorkflowBaseDir,
} from '../../../lib/ai/workflow-verification';

const blueprint: WorkflowBlueprint = {
  contractVersion: '1',
  name: 'demo-flow',
  goal: 'Demo flow',
  trigger: { type: 'api_route', entrypoint: 'app/api/demo/route.ts' },
  inputs: { id: 'string' },
  steps: [],
  suspensions: [],
  streams: [],
  tests: [
    { name: 'happy path', helpers: ['start'], verifies: ['completes'] },
  ],
  antiPatternsAvoided: [],
  invariants: ['exactly one terminal state'],
  compensationPlan: ['undo external write on downstream failure'],
  operatorSignals: ['log demo.started'],
};

describe('inferWorkflowBaseDir', () => {
  it('defaults to "workflows" when context is null', () => {
    expect(inferWorkflowBaseDir(null)).toBe('workflows');
  });

  it('defaults to "workflows" when context is undefined', () => {
    expect(inferWorkflowBaseDir()).toBe('workflows');
  });

  it('returns "src/workflows" when canonicalExamples include src/workflows/', () => {
    const context = {
      canonicalExamples: ['src/workflows/example.ts'],
    } as WorkflowContext;
    expect(inferWorkflowBaseDir(context)).toBe('src/workflows');
  });

  it('returns "workflows" when canonicalExamples has no src/ prefix', () => {
    const context = {
      canonicalExamples: ['workflows/example.ts'],
    } as WorkflowContext;
    expect(inferWorkflowBaseDir(context)).toBe('workflows');
  });

  it('returns "workflows" when canonicalExamples is empty', () => {
    const context = {
      canonicalExamples: [],
    } as WorkflowContext;
    expect(inferWorkflowBaseDir(context)).toBe('workflows');
  });
});

describe('createWorkflowVerificationPlan', () => {
  const plan = createWorkflowVerificationPlan(blueprint);

  it('preserves blueprint.trigger.entrypoint in files', () => {
    const routeFile = plan.files.find((f) => f.kind === 'route');
    expect(routeFile).toBeDefined();
    expect(routeFile!.path).toBe(blueprint.trigger.entrypoint);
  });

  it('emits exactly three file entries with kinds workflow, route, test', () => {
    expect(plan.files).toHaveLength(3);
    const kinds = plan.files.map((f) => f.kind);
    expect(kinds).toEqual(['workflow', 'route', 'test']);
  });

  it('deep-equals blueprint.tests into testMatrix', () => {
    expect(plan.testMatrix).toEqual(blueprint.tests);
  });

  it('includes runtime commands for typecheck, test, and focused-workflow-test', () => {
    const names = plan.runtimeCommands.map((c) => c.name);
    expect(names).toContain('typecheck');
    expect(names).toContain('test');
    expect(names).toContain('focused-workflow-test');
  });

  it('focused-workflow-test command references the generated test file path', () => {
    const focused = plan.runtimeCommands.find(
      (c) => c.name === 'focused-workflow-test'
    );
    expect(focused).toBeDefined();
    expect(focused!.command).toContain('workflows/demo-flow.integration.test.ts');
  });

  it('prefixes implementation notes for invariants, operator signals, and compensation', () => {
    expect(plan.implementationNotes).toContain(
      'Invariant: exactly one terminal state'
    );
    expect(plan.implementationNotes).toContain(
      'Operator signal: log demo.started'
    );
    expect(plan.implementationNotes).toContain(
      'Compensation: undo external write on downstream failure'
    );
  });

  it('sets contractVersion to "1"', () => {
    expect(plan.contractVersion).toBe('1');
  });

  it('sets blueprintName from blueprint.name', () => {
    expect(plan.blueprintName).toBe('demo-flow');
  });

  it('respects context when generating file paths', () => {
    const srcContext = {
      canonicalExamples: ['src/workflows/other.ts'],
    } as WorkflowContext;
    const srcPlan = createWorkflowVerificationPlan(blueprint, srcContext);
    const workflowFile = srcPlan.files.find((f) => f.kind === 'workflow');
    const testFile = srcPlan.files.find((f) => f.kind === 'test');
    expect(workflowFile!.path).toBe('src/workflows/demo-flow.ts');
    expect(testFile!.path).toBe('src/workflows/demo-flow.integration.test.ts');
  });
});
