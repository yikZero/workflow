import { describe, it, expect } from 'vitest';
import { QuickJS } from 'quickjs-wasi';
import { runSnapshotWorkflow } from './snapshot-runtime.js';
import { deserialize } from '../serialization/workflow-vm.js';

/** Helper to deserialize the format-prefixed result bytes */
function unwrapResult(result: Uint8Array): unknown {
  return deserialize(result);
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'wrun_test123',
    workflowName: 'test-workflow',
    status: 'running' as const,
    startedAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    specVersion: 2,
    ...overrides,
  };
}

describe('runSnapshotWorkflow', () => {
  it('should run a simple workflow with no steps to completion', async () => {
    const result = await runSnapshotWorkflow({
      workflowCode: `
        globalThis.__private_workflows = new Map();
        async function hello() { return 42; }
        hello.workflowId = "workflow//test//hello";
        globalThis.__private_workflows.set("workflow//test//hello", hello);
      `,
      workflowId: 'workflow//test//hello',
      workflowRun: makeRun(),
      events: [],
      existingSnapshot: null,
    });

    expect(result.completed).toBeDefined();
    expect(unwrapResult(result.completed!.result)).toBe(42);
  });

  it('should suspend on first step and return pending operations', async () => {
    const result = await runSnapshotWorkflow({
      workflowCode: `
        var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//test//add");
        async function workflow() {
          var a = await add(10, 7);
          return a;
        }
        workflow.workflowId = "workflow//test//workflow";
        globalThis.__private_workflows.set("workflow//test//workflow", workflow);
      `,
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [],
      existingSnapshot: null,
    });

    expect(result.suspended).toBeDefined();
    expect(result.suspended?.pendingOperations).toHaveLength(1);
    expect(result.suspended?.pendingOperations[0]).toMatchObject({
      type: 'step',
      stepId: 'step//test//add',
      correlationId: 'step_0',
    });
    expect(result.suspended?.snapshot).toBeInstanceOf(Uint8Array);
  });

  it('should restore from snapshot and complete after step resolves', async () => {
    const r1 = await runSnapshotWorkflow({
      workflowCode: `
        var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//test//add");
        async function workflow() { return await add(10, 7); }
        workflow.workflowId = "workflow//test//workflow";
        globalThis.__private_workflows.set("workflow//test//workflow", workflow);
      `,
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [],
      existingSnapshot: null,
    });
    expect(r1.suspended).toBeDefined();

    const r2 = await runSnapshotWorkflow({
      workflowCode: '',
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [
        {
          eventId: 'evnt_001',
          runId: 'wrun_test123',
          eventType: 'step_completed',
          correlationId: 'step_0',
          eventData: { output: 17 },
          createdAt: new Date(),
        },
      ],
      existingSnapshot: {
        data: r1.suspended!.snapshot,
        metadata: { eventsCursor: null, createdAt: new Date() },
      },
    });

    expect(unwrapResult(r2.completed!.result)).toBe(17);
  });

  it('should handle multi-step workflows across multiple snapshots', async () => {
    const code = `
      var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//test//add");
      async function workflow() {
        var a = await add(10, 7);
        var b = await add(a, 8);
        return b;
      }
      workflow.workflowId = "workflow//test//workflow";
      globalThis.__private_workflows.set("workflow//test//workflow", workflow);
    `;
    const run = makeRun();

    const r1 = await runSnapshotWorkflow({
      workflowCode: code,
      workflowId: 'workflow//test//workflow',
      workflowRun: run,
      events: [],
      existingSnapshot: null,
    });
    expect(r1.suspended?.pendingOperations[0]?.correlationId).toBe('step_0');

    const r2 = await runSnapshotWorkflow({
      workflowCode: '',
      workflowId: 'workflow//test//workflow',
      workflowRun: run,
      events: [
        {
          eventId: 'evnt_001',
          runId: run.runId,
          eventType: 'step_completed',
          correlationId: 'step_0',
          eventData: { output: 17 },
          createdAt: new Date(),
        },
      ],
      existingSnapshot: {
        data: r1.suspended!.snapshot,
        metadata: { eventsCursor: null, createdAt: new Date() },
      },
    });
    expect(r2.suspended?.pendingOperations[0]?.correlationId).toBe('step_1');

    const r3 = await runSnapshotWorkflow({
      workflowCode: '',
      workflowId: 'workflow//test//workflow',
      workflowRun: run,
      events: [
        {
          eventId: 'evnt_002',
          runId: run.runId,
          eventType: 'step_completed',
          correlationId: 'step_1',
          eventData: { output: 25 },
          createdAt: new Date(),
        },
      ],
      existingSnapshot: {
        data: r2.suspended!.snapshot,
        metadata: { eventsCursor: 'evnt_001', createdAt: new Date() },
      },
    });
    expect(unwrapResult(r3.completed!.result)).toBe(25);
  });

  it('should handle sleep suspension and wake', async () => {
    const r1 = await runSnapshotWorkflow({
      workflowCode: `
        async function workflow() {
          await globalThis[Symbol.for("WORKFLOW_SLEEP")]("5s");
          return "woke up";
        }
        workflow.workflowId = "workflow//test//workflow";
        globalThis.__private_workflows.set("workflow//test//workflow", workflow);
      `,
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [],
      existingSnapshot: null,
    });
    expect(r1.suspended).toBeDefined();
    expect(r1.suspended?.pendingOperations[0]).toMatchObject({
      type: 'wait',
      correlationId: 'wait_0',
    });

    const r2 = await runSnapshotWorkflow({
      workflowCode: '',
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [
        {
          eventId: 'evnt_001',
          runId: 'wrun_test123',
          eventType: 'wait_completed',
          correlationId: 'wait_0',
          createdAt: new Date(),
        },
      ],
      existingSnapshot: {
        data: r1.suspended!.snapshot,
        metadata: { eventsCursor: null, createdAt: new Date() },
      },
    });
    expect(unwrapResult(r2.completed!.result)).toBe('woke up');
  });

  it('should handle step failure with try/catch in workflow', async () => {
    const r1 = await runSnapshotWorkflow({
      workflowCode: `
        var fail = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//test//fail");
        async function workflow() {
          try { await fail(); return "nope"; }
          catch (e) { return "caught: " + e.message; }
        }
        workflow.workflowId = "workflow//test//workflow";
        globalThis.__private_workflows.set("workflow//test//workflow", workflow);
      `,
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [],
      existingSnapshot: null,
    });
    expect(r1.suspended).toBeDefined();

    const r2 = await runSnapshotWorkflow({
      workflowCode: '',
      workflowId: 'workflow//test//workflow',
      workflowRun: makeRun(),
      events: [
        {
          eventId: 'evnt_001',
          runId: 'wrun_test123',
          eventType: 'step_failed',
          correlationId: 'step_0',
          eventData: { error: { message: 'boom' } },
          createdAt: new Date(),
        },
      ],
      existingSnapshot: {
        data: r1.suspended!.snapshot,
        metadata: { eventsCursor: null, createdAt: new Date() },
      },
    });
    expect(unwrapResult(r2.completed!.result)).toBe('caught: boom');
  });
});

describe('raw QuickJS proof of concept', () => {
  it('should run, snapshot, restore, and complete', async () => {
    const vm = await QuickJS.create();

    vm.unwrapResult(
      vm.evalCode(`
      globalThis.__private_workflows = new Map();
      globalThis.__resolvers = {};
      globalThis.__pending = [];
      globalThis.__stepCounter = 0;
      globalThis.__workflowResult = undefined;

      globalThis[Symbol.for("WORKFLOW_USE_STEP")] = function(stepId) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          var cid = "step_" + (globalThis.__stepCounter++);
          globalThis.__pending.push({ type: "step", correlationId: cid, stepId: stepId });
          return new Promise(function(resolve, reject) {
            globalThis.__resolvers[cid] = { resolve: resolve, reject: reject };
          });
        };
      };

      var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//test//add");
      async function simple(i) { var a = await add(i, 7); var b = await add(a, 8); return b; }
      globalThis.__private_workflows.set("test", simple);
      globalThis.__private_workflows.get("test")(10).then(function(r) { globalThis.__workflowResult = r; });
    `)
    ).dispose();
    vm.executePendingJobs();

    const snap1 = vm.snapshot();
    vm.dispose();

    const vm2 = await QuickJS.restore(snap1);
    vm2
      .unwrapResult(
        vm2.evalCode('globalThis.__resolvers["step_0"].resolve(17);')
      )
      .dispose();
    vm2.executePendingJobs();
    const snap2 = vm2.snapshot();
    vm2.dispose();

    const vm3 = await QuickJS.restore(snap2);
    vm3
      .unwrapResult(
        vm3.evalCode('globalThis.__resolvers["step_1"].resolve(25);')
      )
      .dispose();
    vm3.executePendingJobs();

    expect(
      vm3.dump(vm3.unwrapResult(vm3.evalCode('globalThis.__workflowResult')))
    ).toBe(25);
    vm3.dispose();
  });
});
