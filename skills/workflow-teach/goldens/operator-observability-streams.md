# Golden Scenario: Operator Observability Streams

## Scenario

A data pipeline workflow ingests CSV files, validates rows, transforms data, loads into a data warehouse, and generates a summary report. Operators need real-time visibility into progress (rows processed, validation errors, load status) via streams, and must be able to diagnose failures from structured logs without accessing the runtime directly.

## Interview Context

The workflow-teach interview should surface these answers:

| Bucket | Expected Answer |
|--------|----------------|
| Workflow starter/emitter | Scheduled cron job or manual trigger from ops dashboard |
| Repeat-safe side effects | Data warehouse load uses upsert by row hash; report generation overwrites previous report |
| Permanent vs retryable | Malformed CSV is permanent (fatal); warehouse connection timeout is retryable; report generation failure is retryable |
| Approval actors | No human approval required |
| Timeout/expiry rules | Each batch must complete within 30 minutes; individual step timeout of 5 minutes |
| Compensation requirements | If warehouse load fails after partial insert, no rollback needed (upsert makes re-run safe); if report fails, pipeline is still considered successful |
| Operator observability | Stream row-level progress (processed/total), stream validation error summary, log batch ID with row counts at each stage, log final status with duration |

## Expected Context Fields

```json
{
  "businessInvariants": [
    "Data warehouse loads must be idempotent — re-running the same batch produces the same result",
    "Validation errors must be surfaced to operators, not silently dropped"
  ],
  "idempotencyRequirements": [
    "Warehouse load uses upsert keyed by row content hash",
    "Report generation overwrites by batch ID"
  ],
  "approvalRules": [],
  "timeoutRules": [
    "Batch must complete within 30 minutes",
    "Individual step timeout of 5 minutes"
  ],
  "compensationRules": [
    "No rollback for partial warehouse load — upsert makes re-run safe",
    "Report failure does not require compensation"
  ],
  "observabilityRequirements": [
    "Stream row-level progress: rows processed vs total rows",
    "Stream validation error summary with row numbers and error types",
    "Log batch.started with batch ID and source file",
    "Log batch.validated with valid/invalid row counts",
    "Log batch.loaded with inserted/updated/skipped counts",
    "Log batch.completed with final status and total duration"
  ]
}
```

## Downstream Expectations

### workflow-design

The blueprint must include:

- `streams` with at least two namespaces: row progress and validation errors
- `operatorSignals` echoing every log line from observability requirements
- `invariants` echoing the idempotent-load and no-silent-drop rules
- Steps that use `getWritable()` for streaming progress

### workflow-stress

Must flag:

- Missing stream namespaces for separating progress from error data
- Missing structured log entries for batch lifecycle events
- Whether `getWritable()` calls comply with stream I/O placement rules

### workflow-verify

Must generate:

- Test for happy path with stream output verification
- Test for validation errors being streamed (not swallowed)
- Test for warehouse timeout with retry
- Test for batch timeout

## Verification Criteria

- [ ] Interview prioritizes operator observability as a first-class concern
- [ ] `observabilityRequirements` is the most detailed field in the context
- [ ] `streams` in the blueprint include separate namespaces for progress and errors
- [ ] `operatorSignals` in the blueprint maps 1:1 to observability requirements
- [ ] Downstream stress test validates stream placement and namespace separation
