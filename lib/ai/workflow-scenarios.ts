export type WorkflowScenarioName =
  | 'workflow-approval'
  | 'workflow-webhook'
  | 'workflow-saga'
  | 'workflow-timeout'
  | 'workflow-idempotency'
  | 'workflow-observe';

export type WorkflowScenario = {
  name: WorkflowScenarioName;
  goal: string;
  invokes: Array<
    'workflow-teach' | 'workflow-design' | 'workflow-stress' | 'workflow-verify'
  >;
  requiredPatterns: Array<
    | 'hook'
    | 'webhook'
    | 'sleep'
    | 'retry'
    | 'compensation'
    | 'stream'
    | 'child-workflow'
  >;
  blueprintName: string;
};

export const WORKFLOW_SCENARIOS: WorkflowScenario[] = [
  {
    name: 'workflow-approval',
    goal: 'Human approval flows with expiry, escalation, and operator signals.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['hook', 'sleep', 'retry', 'stream'],
    blueprintName: 'approval-expiry-escalation',
  },
  {
    name: 'workflow-webhook',
    goal: 'External ingress flows that survive duplicate delivery and partial failure.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['webhook', 'retry', 'compensation'],
    blueprintName: 'webhook-ingress',
  },
  {
    name: 'workflow-saga',
    goal: 'Multi-step side effects with explicit compensation.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['compensation', 'retry'],
    blueprintName: 'compensation-saga',
  },
  {
    name: 'workflow-timeout',
    goal: 'Flows whose correctness depends on expiry and wake-up behavior.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['sleep', 'hook', 'retry'],
    blueprintName: 'approval-timeout-streaming',
  },
  {
    name: 'workflow-idempotency',
    goal: 'Side effects that remain safe under retries, replay, and duplicate events.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['retry', 'compensation', 'webhook'],
    blueprintName: 'duplicate-webhook-order',
  },
  {
    name: 'workflow-observe',
    goal: 'Operator-visible progress, stream namespaces, and terminal signals.',
    invokes: [
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
    requiredPatterns: ['stream', 'hook', 'sleep'],
    blueprintName: 'operator-observability-streams',
  },
];
