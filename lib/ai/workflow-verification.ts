import type {
  WorkflowBlueprint,
  WorkflowContext,
  WorkflowTestPlan,
} from './workflow-blueprint';

export type VerificationFileKind = 'workflow' | 'route' | 'test';

export type VerificationFilePlan = {
  path: string;
  kind: VerificationFileKind;
  purpose: string;
};

export type RuntimeVerificationCommand = {
  name: string;
  command: string;
  expects: string;
};

export type WorkflowVerificationPlan = {
  contractVersion: '1';
  blueprintName: string;
  files: VerificationFilePlan[];
  testMatrix: WorkflowTestPlan[];
  runtimeCommands: RuntimeVerificationCommand[];
  implementationNotes: string[];
};

export function inferWorkflowBaseDir(
  context?: WorkflowContext | null
): 'workflows' | 'src/workflows' {
  const examples = context?.canonicalExamples ?? [];
  return examples.some((value) => value.startsWith('src/workflows/'))
    ? 'src/workflows'
    : 'workflows';
}

export function createWorkflowVerificationPlan(
  blueprint: WorkflowBlueprint,
  context?: WorkflowContext | null
): WorkflowVerificationPlan {
  const workflowDir = inferWorkflowBaseDir(context);
  const workflowFile = `${workflowDir}/${blueprint.name}.ts`;
  const testFile = `${workflowDir}/${blueprint.name}.integration.test.ts`;

  return {
    contractVersion: '1',
    blueprintName: blueprint.name,
    files: [
      {
        path: workflowFile,
        kind: 'workflow',
        purpose: 'Workflow orchestration and step implementations',
      },
      {
        path: blueprint.trigger.entrypoint,
        kind: 'route',
        purpose: 'Entrypoint that starts or resumes the workflow',
      },
      {
        path: testFile,
        kind: 'test',
        purpose:
          'Integration coverage for hooks, sleeps, retries, and return values',
      },
    ],
    testMatrix: blueprint.tests,
    runtimeCommands: [
      {
        name: 'typecheck',
        command: 'pnpm typecheck',
        expects: 'No TypeScript errors',
      },
      {
        name: 'test',
        command: 'pnpm test',
        expects: 'All repository tests pass',
      },
      {
        name: 'focused-workflow-test',
        command: `pnpm vitest run ${testFile}`,
        expects: `${blueprint.name} integration tests pass`,
      },
    ],
    implementationNotes: [
      ...blueprint.invariants.map((value) => `Invariant: ${value}`),
      ...blueprint.operatorSignals.map((value) => `Operator signal: ${value}`),
      ...blueprint.compensationPlan.map((value) => `Compensation: ${value}`),
    ],
  };
}
