export type WorkflowContext = {
  projectName: string;
  productGoal: string;
  triggerSurfaces: string[];
  externalSystems: string[];
  antiPatterns: string[];
  canonicalExamples: string[];
};

export type WorkflowStepPlan = {
  name: string;
  runtime: 'workflow' | 'step';
  purpose: string;
  sideEffects: string[];
  idempotencyKey?: string;
  maxRetries?: number;
  failureMode: 'default' | 'fatal' | 'retryable';
};

export type SuspensionPlan =
  | { kind: 'hook'; tokenStrategy: 'deterministic'; payloadType: string }
  | { kind: 'webhook'; responseMode: 'static' | 'manual' }
  | { kind: 'sleep'; duration: string };

export type WorkflowTestPlan = {
  name: string;
  helpers: Array<
    | 'start'
    | 'getRun'
    | 'resumeHook'
    | 'resumeWebhook'
    | 'waitForHook'
    | 'waitForSleep'
    | 'wakeUp'
  >;
  verifies: string[];
};

export type WorkflowBlueprint = {
  name: string;
  goal: string;
  trigger: { type: string; entrypoint: string };
  inputs: Record<string, string>;
  steps: WorkflowStepPlan[];
  suspensions: SuspensionPlan[];
  streams: Array<{ namespace: string | null; payload: string }>;
  tests: WorkflowTestPlan[];
  antiPatternsAvoided: string[];
};
