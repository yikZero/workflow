/**
 * Standalone test for the snapshot runtime.
 *
 * Proves the core mechanism: run workflow code in QuickJS, suspend on a step,
 * snapshot, restore, resolve the step, and verify the workflow completes.
 */

import { describe, it, expect } from 'vitest';
import { QuickJS } from 'quickjs-wasi';

describe('snapshot runtime - proof of concept', () => {
  it('should run a simple workflow, snapshot on step, restore and complete', async () => {
    // ---- Phase 1: First run — workflow hits a step and suspends ----

    const vm1 = await QuickJS.create();

    // Track pending step invocations on the host side
    const pendingSteps = new Map<
      string,
      { resolve: (val: any) => void; reject: (val: any) => void }
    >();
    let stepCounter = 0;

    // Install the WORKFLOW_USE_STEP symbol
    // This must return a FUNCTION that, when called with args, returns a Promise
    {
      using useStepFactory = vm1.newFunction('useStep', (...args) => {
        const stepId = args[0].toString();

        // Return a function that creates a deferred promise when called
        using fn = vm1.newFunction(`step_${stepId}`, (...stepArgs) => {
          const correlationId = `step_${stepCounter++}`;
          const deferred = vm1.newPromise();

          // Store the resolve/reject functions on a global for retrieval after restore
          {
            using resolvers = vm1.global.getProp('__resolvers');
            using resolveHandle = vm1.evalCode(
              `(function(v) { globalThis['__resolve_${correlationId}'] = v; })`
            );
            // Actually, simpler approach: store the resolve func directly on globalThis
            vm1.setProp(
              vm1.global,
              `__resolve_${correlationId}`,
              deferred.handle.getProp('then')
            );
          }

          // Actually, let's use a much simpler approach:
          // Store the resolve function on globalThis keyed by correlationId
          vm1
            .unwrapResult(
              vm1.evalCode(`
            globalThis.__pending = globalThis.__pending || {};
            globalThis.__pending["${correlationId}"] = {};
          `)
            )
            .dispose();

          // We need to store the resolve function handle so we can call it after restore
          // The simplest way: eval code that creates the promise and stores the resolve func
          // on the global, all inside QuickJS
          return deferred.handle;
        });

        return fn.dup();
      });

      using sym = vm1.newSymbolFor('WORKFLOW_USE_STEP');
      vm1.setProp(vm1.global, sym, useStepFactory);
    }

    // Nope — this approach of mixing host-side Deferred with QuickJS-side storage
    // is getting complicated. Let me try a fully QuickJS-side approach instead.
    vm1.dispose();

    // ---- Take 2: Do everything inside QuickJS ----

    const vm = await QuickJS.create();

    // Install useStep: returns a function that, when called, creates a promise
    // and stores the resolve/reject on globalThis.__resolvers[correlationId]
    vm.unwrapResult(
      vm.evalCode(`
      globalThis.__private_workflows = new Map();
      globalThis.__resolvers = {};
      globalThis.__stepCounter = 0;
      globalThis.__pendingStepIds = [];

      globalThis[Symbol.for("WORKFLOW_USE_STEP")] = function(stepId) {
        return function(...args) {
          const correlationId = "step_" + (globalThis.__stepCounter++);
          globalThis.__pendingStepIds.push(correlationId);
          return new Promise((resolve, reject) => {
            globalThis.__resolvers[correlationId] = { resolve, reject, stepId, args };
          });
        };
      };
    `)
    ).dispose();

    // Evaluate a simple compiled workflow bundle
    vm.unwrapResult(
      vm.evalCode(`
      // Simulated compiled workflow (what the SWC plugin would produce)
      var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//./test//add");

      async function simple(i) {
        const a = await add(i, 7);
        const b = await add(a, 8);
        return b;
      }
      simple.workflowId = "workflow//./test//simple";
      globalThis.__private_workflows.set("workflow//./test//simple", simple);
    `)
    ).dispose();

    // Run the workflow
    vm.unwrapResult(
      vm.evalCode(`
      const workflowFn = globalThis.__private_workflows.get("workflow//./test//simple");
      globalThis.__workflowResult = undefined;
      globalThis.__workflowError = undefined;
      workflowFn(10).then(
        result => { globalThis.__workflowResult = result; },
        error => { globalThis.__workflowError = error.message; }
      );
    `)
    ).dispose();
    vm.executePendingJobs();

    // Check: workflow should be suspended on first step
    const pendingIds1 = vm.dump(
      vm.unwrapResult(vm.evalCode('globalThis.__pendingStepIds'))
    );
    expect(pendingIds1).toEqual(['step_0']);

    // Check: workflow result should not be set yet
    const result1 = vm.dump(
      vm.unwrapResult(vm.evalCode('globalThis.__workflowResult'))
    );
    expect(result1).toBeUndefined();

    // ---- Phase 2: Snapshot the VM ----

    const snapshot = vm.snapshot();
    const serialized = QuickJS.serializeSnapshot(snapshot);
    vm.dispose();

    // ---- Phase 3: Restore and resolve the first step ----

    const vm2 = await QuickJS.restore(QuickJS.deserializeSnapshot(serialized));

    // Resolve step_0 with result: add(10, 7) = 17
    vm2
      .unwrapResult(
        vm2.evalCode(`
      globalThis.__resolvers["step_0"].resolve(17);
    `)
      )
      .dispose();
    vm2.executePendingJobs();

    // The workflow should now be suspended on step_1
    const pendingIds2 = vm2.dump(
      vm2.unwrapResult(vm2.evalCode('globalThis.__pendingStepIds'))
    );
    expect(pendingIds2).toEqual(['step_0', 'step_1']);

    // ---- Phase 4: Snapshot again, restore, resolve the second step ----

    const snapshot2 = vm2.snapshot();
    const serialized2 = QuickJS.serializeSnapshot(snapshot2);
    vm2.dispose();

    const vm3 = await QuickJS.restore(QuickJS.deserializeSnapshot(serialized2));

    // Resolve step_1 with result: add(17, 8) = 25
    vm3
      .unwrapResult(
        vm3.evalCode(`
      globalThis.__resolvers["step_1"].resolve(25);
    `)
      )
      .dispose();
    vm3.executePendingJobs();

    // The workflow should now be complete
    const finalResult = vm3.dump(
      vm3.unwrapResult(vm3.evalCode('globalThis.__workflowResult'))
    );
    expect(finalResult).toBe(25);

    vm3.dispose();
  });

  it('should preserve step metadata across snapshot/restore', async () => {
    const vm = await QuickJS.create();

    vm.unwrapResult(
      vm.evalCode(`
      globalThis.__private_workflows = new Map();
      globalThis.__resolvers = {};
      globalThis.__stepCounter = 0;

      globalThis[Symbol.for("WORKFLOW_USE_STEP")] = function(stepId) {
        return function(...args) {
          const correlationId = "step_" + (globalThis.__stepCounter++);
          return new Promise((resolve, reject) => {
            globalThis.__resolvers[correlationId] = {
              resolve, reject, stepId,
              args: JSON.stringify(args),
            };
          });
        };
      };

      var add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("step//./test//add");

      async function workflow(x) {
        'use workflow';
        const result = await add(x, 5);
        return result;
      }
      globalThis.__private_workflows.set("test", workflow);

      globalThis.__workflowResult = undefined;
      globalThis.__private_workflows.get("test")(42).then(
        r => { globalThis.__workflowResult = r; }
      );
    `)
    ).dispose();
    vm.executePendingJobs();

    // Check the pending step has the right metadata
    const resolverInfo = vm.dump(
      vm.unwrapResult(
        vm.evalCode(`
      const r = globalThis.__resolvers["step_0"];
      ({ stepId: r.stepId, args: r.args })
    `)
      )
    );
    expect(resolverInfo).toEqual({
      stepId: 'step//./test//add',
      args: '[42,5]',
    });

    // Snapshot, restore, resolve
    const snapshot = vm.snapshot();
    vm.dispose();

    const vm2 = await QuickJS.restore(snapshot);
    vm2
      .unwrapResult(
        vm2.evalCode(`
      globalThis.__resolvers["step_0"].resolve(47);
    `)
      )
      .dispose();
    vm2.executePendingJobs();

    const result = vm2.dump(
      vm2.unwrapResult(vm2.evalCode('globalThis.__workflowResult'))
    );
    expect(result).toBe(47);

    vm2.dispose();
  });
});
