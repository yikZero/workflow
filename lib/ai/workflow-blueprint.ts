export type WorkflowContext = {
  contractVersion: string;
  projectName: string;
  productGoal: string;
  triggerSurfaces: string[];
  externalSystems: string[];
  antiPatterns: string[];
  canonicalExamples: string[];
  businessInvariants: string[];
  idempotencyRequirements: string[];
  approvalRules: string[];
  timeoutRules: string[];
  compensationRules: string[];
  observabilityRequirements: string[];
  openQuestions: string[];
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
  contractVersion: string;
  name: string;
  goal: string;
  trigger: { type: string; entrypoint: string };
  inputs: Record<string, string>;
  steps: WorkflowStepPlan[];
  suspensions: SuspensionPlan[];
  streams: Array<{ namespace: string | null; payload: string }>;
  tests: WorkflowTestPlan[];
  antiPatternsAvoided: string[];
  invariants: string[];
  compensationPlan: string[];
  operatorSignals: string[];
};
