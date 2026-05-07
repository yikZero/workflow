async function runIndexedStep(index: number): Promise<{ index: number }> {
  'use step';
  return { index };
}

export async function twoHundredStepsWorkflow() {
  'use workflow';

  const totalSteps = 200;
  const results: number[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const result = await runIndexedStep(i);
    results.push(result.index);
  }

  return {
    totalSteps,
    firstStep: results[0],
    lastStep: results[results.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Reproduction workflow for the scheduleWhenIdle premature-suspension bug.
// ---------------------------------------------------------------------------
//
// 50 concurrent items, each doing search → addResult sequentially. Search
// step delays vary per item to create realistic timing skew. With variable
// hydration timing, the runtime can race scheduleWhenIdle against the
// addResult callback registration, leaving addResult's step_created event
// unconsumed → WorkflowRuntimeError.
//
// NOTE: this exercise pattern is necessary but not always sufficient to
// trigger the race in local world-local (single process). The race
// manifests reliably in production where flow handlers run in separate
// function invocations across the suspension boundary. Use this as
// a regression sentinel — should always pass post-fix.

async function searchStep(item: number) {
  'use step';
  await new Promise((r) => setTimeout(r, 20 + ((item * 11) % 90)));
  return { item, result: `search_result_${item}` };
}

async function addResultStep(item: number, searchResult: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 10 + ((item * 7) % 40)));
  return { item, added: true, len: searchResult.length };
}

export async function scheduleWhenIdleReproWorkflow() {
  'use workflow';

  const N_ITEMS = 50;

  const results = await Promise.all(
    Array.from({ length: N_ITEMS }, async (_, i) => {
      const searchResult = await searchStep(i);
      const addResult = await addResultStep(i, searchResult.result);
      return addResult;
    })
  );

  const completed = results.filter((r) => r.added).length;
  return { totalItems: N_ITEMS, completed };
}
