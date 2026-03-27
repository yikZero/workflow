# Golden: Operator Observability Streams

## Sample Prompt

> /workflow-observe stream operator progress and final status

## Expected Context Fields

The `workflow-teach` stage should capture:

- `observabilityRequirements`: Operators need real-time progress for every significant state transition; stream namespaces for structured log channels
- `businessInvariants`: Every workflow must emit at least a start and terminal signal
- `idempotencyRequirements`: Stream writes must be idempotent under replay

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "operator-observability-streams",
  "goal": "Provide operator-visible progress, stream namespaces, and terminal signals",
  "trigger": { "type": "api_route", "entrypoint": "app/api/workflows/observable/route.ts" },
  "inputs": { "workflowId": "string", "operatorId": "string" },
  "steps": [
    { "name": "initializeStreams", "runtime": "step", "purpose": "Set up stream namespaces for progress and audit channels", "sideEffects": [], "failureMode": "default" },
    { "name": "executeBusinessLogic", "runtime": "step", "purpose": "Run the core business logic with progress updates", "sideEffects": ["database", "api_call"], "idempotencyKey": "exec:wf-${workflowId}", "failureMode": "retryable" },
    { "name": "emitTerminalSignal", "runtime": "step", "purpose": "Write final status to all stream namespaces", "sideEffects": ["stream"], "failureMode": "default" }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "OperatorAction" },
    { "kind": "sleep", "duration": "1h" }
  ],
  "streams": [
    { "namespace": "progress", "payload": "{ step: string, status: string, timestamp: string }" },
    { "namespace": "audit", "payload": "{ action: string, actor: string, details: string }" },
    { "namespace": null, "payload": "{ terminal: boolean, outcome: string }" }
  ],
  "tests": [
    { "name": "progress-stream-emits-for-each-step", "helpers": ["start", "getRun"], "verifies": ["Progress namespace receives an event for every step transition"] },
    { "name": "terminal-signal-emitted-on-completion", "helpers": ["start", "getRun"], "verifies": ["Terminal signal is written to default namespace on workflow end"] },
    { "name": "operator-hook-pauses-and-resumes", "helpers": ["start", "getRun", "waitForHook", "resumeHook"], "verifies": ["Operator-initiated hook correctly pauses and resumes workflow"] },
    { "name": "stream-assertions-under-replay", "helpers": ["start", "getRun"], "verifies": ["Stream writes are idempotent under workflow replay"] }
  ],
  "antiPatternsAvoided": ["missing terminal signals", "unstructured log output", "non-namespaced streams"],
  "invariants": [
    "Every workflow must emit at least a start and terminal signal",
    "Stream namespace writes must be idempotent under replay"
  ],
  "compensationPlan": [],
  "operatorSignals": [
    "Log workflow.started with workflow ID and operator context",
    "Log workflow.progress for each significant state transition",
    "Log workflow.completed with final outcome and duration"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `waitForHook` — wait for operator-initiated hook registration
- `resumeHook` — deliver operator action
- `run.returnValue` — assert the final workflow output including terminal signals
