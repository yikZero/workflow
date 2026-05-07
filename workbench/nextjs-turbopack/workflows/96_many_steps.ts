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
// Mirrors the failing production run wrun_01KQ05J17ZJHGZFRYZ20QM1DBS:
//   - 80 concurrent items in Promise.all (production had 45 with heavier
//     payloads, 80 with light payloads gives equivalent suspension density)
//   - Each item runs 5 nested waves of steps:
//       1. parallel search repetitions per item
//       2. sequential addResult (the "TA0-equivalent" step that was unclaimed)
//       3. sequential getProjectResults
//       4. parallel exa-source loop
//       5. sequential getToday + parallel fetchStatus
//   - A few items per wave 1 are stragglers — their searchStep takes 10–15s
//     while everything else completes in <100ms. This is the timing skew
//     pattern that triggers scheduleWhenIdle to fire WorkflowSuspension
//     between the fast hydration wave completing and the next useStep
//     callback registering, leaving addResult's step_created unclaimed.

async function searchStep(item: number, rep: number) {
  'use step';
  // Stragglers (1 in 17 items) take 10–15s — matches the T97/T9T/T9V
  // pattern from the production event log where 3 of ~250 steps lagged
  // far behind the others.
  const isStraggler = item % 17 === 3;
  const delay = isStraggler
    ? 10000 + ((item * 31) % 5000)
    : 30 + ((item * 11 + rep * 7) % 80);
  await new Promise((r) => setTimeout(r, delay));
  return { item, rep, result: `search_${item}_${rep}` };
}

async function addResultStep(item: number, searchResults: string[]) {
  'use step';
  await new Promise((r) => setTimeout(r, 30 + ((item * 7) % 50)));
  return { item, added: true, count: searchResults.length };
}

async function getProjectResultsStep(item: number) {
  'use step';
  await new Promise((r) => setTimeout(r, 20 + ((item * 13) % 40)));
  return { item, results: [`r_${item}_a`, `r_${item}_b`] };
}

async function exaSourceStep(item: number, resultId: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 15 + ((item * 5) % 30)));
  return { item, resultId, ok: true };
}

async function getTodayStep() {
  'use step';
  await new Promise((r) => setTimeout(r, 5));
  return '2026-05-07';
}

async function fetchStatusStep(item: number, resultId: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 10 + ((item * 3) % 20)));
  return { item, resultId, status: 'active' };
}

export async function scheduleWhenIdleReproWorkflow() {
  'use workflow';

  const N_ITEMS = 80;
  const REPS_PER_ITEM = 3;

  const results = await Promise.all(
    Array.from({ length: N_ITEMS }, async (_, i) => {
      // Wave 1: parallel search repetitions per item — some items have
      // a very slow straggler that lags behind the rest of the batch.
      const repetitionOutcomes = await Promise.allSettled(
        Array.from({ length: REPS_PER_ITEM }, (_, rep) => searchStep(i, rep))
      );
      const fulfilled = repetitionOutcomes
        .filter((o) => o.status === 'fulfilled')
        .map(
          (o) => (o as PromiseFulfilledResult<{ result: string }>).value.result
        );

      // Wave 2: sequential addResult — this is the step whose callback
      // scheduleWhenIdle preempts in the buggy runtime, leaving its
      // step_created unclaimed in the event log.
      await addResultStep(i, fulfilled);

      // Wave 3: sequential getProjectResults
      const projectResults = await getProjectResultsStep(i);

      // Wave 4: parallel exa-source loop
      await Promise.allSettled(
        projectResults.results.map((rid) => exaSourceStep(i, rid))
      );

      // Wave 5: sequential getToday + parallel fetchStatus
      const today = await getTodayStep();
      await Promise.allSettled(
        projectResults.results.map((rid) => fetchStatusStep(i, rid))
      );

      return { item: i, today, ok: true };
    })
  );

  const completed = results.filter((r) => r.ok).length;
  return { totalItems: N_ITEMS, completed };
}
