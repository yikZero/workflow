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
// Mirrors the user's production workflow shape:
//   update status -> check substitution -> create project -> Promise.all([
//     populateName,
//     ...items.map(async () => {
//       search repetitions -> add-result -> get project results ->
//       source attempts -> date -> status fetch/update
//     })
//   ]) -> update status
//
// The important shape is a large outer Promise.all where each item advances
// through several sequential waves while a few search repetitions are slow
// stragglers. Those stragglers schedule WorkflowSuspension while fast items are
// still hydrating results and registering next-wave callbacks.

async function updateWorkflowRunStatusStep(status: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 5));
  return { status };
}

async function checkSubstitutionStep() {
  'use step';
  return { variableNames: ['region', 'segment'] };
}

async function createProjectStep() {
  'use step';
  await new Promise((r) => setTimeout(r, 10));
  return { projectId: 'project_schedule_when_idle_repro' };
}

async function populateNameStep(projectId: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 30));
  return { projectId, name: 'Schedule When Idle Repro' };
}

async function runAgentStep(
  agentSlug: 'search' | 'add-result' | 'source',
  item: number,
  repOrResult = 0
) {
  'use step';

  if (agentSlug === 'search') {
    const isStraggler = item % 17 === 3 && repOrResult === 0;
    const delay = isStraggler
      ? 10000 + ((item * 31) % 5000)
      : 30 + ((item * 11 + repOrResult * 7) % 80);
    await new Promise((r) => setTimeout(r, delay));
    return {
      agentSlug,
      item,
      messages: [`search_${item}_${repOrResult}`],
    };
  }

  const delay =
    agentSlug === 'add-result'
      ? 30 + ((item * 7) % 50)
      : 15 + ((item * 5 + repOrResult * 3) % 30);
  await new Promise((r) => setTimeout(r, delay));
  return { agentSlug, item, messages: [`${agentSlug}_${item}_${repOrResult}`] };
}

async function getProjectResultsStep(item: number) {
  'use step';
  await new Promise((r) => setTimeout(r, 20 + ((item * 13) % 40)));
  return { item, results: [`r_${item}_a`, `r_${item}_b`] };
}

async function hasExaSourceLinkStep(item: number, resultIndex: number) {
  'use step';
  await new Promise((r) => setTimeout(r, 5 + ((item + resultIndex) % 10)));
  return true;
}

async function getTodayStep() {
  'use step';
  await new Promise((r) => setTimeout(r, 5));
  return '2026-05-07';
}

async function updateResultDataStep(item: number, resultId: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 5 + ((item * 2) % 15)));
  return { item, resultId, updated: true };
}

async function fetchStatusStep(item: number, resultId: string) {
  'use step';
  await new Promise((r) => setTimeout(r, 10 + ((item * 3) % 20)));
  return { item, resultId, status: 'active' };
}

async function runExaSourceForResultInCurrentRun(
  item: number,
  resultIndex: number
) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await runAgentStep('source', item, resultIndex);
    const hasSourceLink = await hasExaSourceLinkStep(item, resultIndex);
    if (hasSourceLink) {
      return;
    }
  }
}

export async function scheduleWhenIdleReproWorkflow() {
  'use workflow';

  await updateWorkflowRunStatusStep('started');
  await checkSubstitutionStep();
  const { projectId } = await createProjectStep();

  const populateName = populateNameStep(projectId);

  const N_ITEMS = 45;
  const REPS_PER_ITEM = 3;

  await Promise.all([
    populateName,
    ...Array.from({ length: N_ITEMS }, async (_, i) => {
      const repetitionOutcomes = await Promise.allSettled(
        Array.from({ length: REPS_PER_ITEM }, (_, rep) =>
          runAgentStep('search', i, rep)
        )
      );
      const messages = repetitionOutcomes.flatMap((outcome) =>
        outcome.status === 'fulfilled' ? outcome.value.messages : []
      );

      await runAgentStep('add-result', i, messages.length);

      const projectResults = await getProjectResultsStep(i);

      await Promise.allSettled(
        projectResults.results.map((_, resultIndex) =>
          runExaSourceForResultInCurrentRun(i, resultIndex)
        )
      );

      const today = await getTodayStep();
      await Promise.allSettled(
        projectResults.results.map(async (resultId) => {
          await fetchStatusStep(i, resultId);
          await updateResultDataStep(i, resultId);
        })
      );

      return { item: i, today, ok: true };
    }),
  ]);

  await updateWorkflowRunStatusStep('completed');

  return { totalItems: N_ITEMS, completed: N_ITEMS };
}
