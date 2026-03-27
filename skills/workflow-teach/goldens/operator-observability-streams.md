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

## Expected `.workflow.md` Sections

### Project Context

Data pipeline for CSV ingestion. Needs durable workflows because batches can take up to 30 minutes and operators need real-time progress visibility.

### Business Rules

- Data warehouse loads must be idempotent — re-running the same batch produces the same result.
- Validation errors must be surfaced to operators, not silently dropped.
- Warehouse load uses upsert keyed by row content hash.
- Report generation overwrites by batch ID.

### External Systems

- Data warehouse (load, query). Supports upsert. Trigger: cron job or manual ops dashboard.
- Report generation service (write). Overwrites by batch ID.

### Failure Expectations

- Malformed CSV: permanent (fatal — code/data bug).
- Warehouse connection timeout: retryable.
- Report generation failure: retryable. Does not block pipeline success.
- No rollback for partial warehouse load — upsert makes re-run safe.
- Batch must complete within 30 minutes; individual step timeout of 5 minutes.

### Observability Needs

- Stream row-level progress: rows processed vs total rows.
- Stream validation error summary with row numbers and error types.
- Log batch.started with batch ID and source file.
- Log batch.validated with valid/invalid row counts.
- Log batch.loaded with inserted/updated/skipped counts.
- Log batch.completed with final status and total duration.

### Open Questions

(none for this scenario)

## Downstream Expectations

### workflow-build

When building this workflow, the build skill should:

- Use separate stream namespaces for row progress and validation errors
- Ensure `getWritable()` stream I/O happens in steps, not workflow context
- Flag that report failure should not block pipeline success
- Produce tests for: happy path with stream verification, validation errors being streamed, warehouse timeout with retry

## Verification Criteria

- [ ] Interview prioritizes operator observability as a first-class concern
- [ ] `.workflow.md` Observability Needs is the most detailed section
- [ ] `.workflow.md` Business Rules captures the no-silent-drop rule
- [ ] `.workflow.md` Failure Expectations distinguishes fatal CSV errors from retryable warehouse errors
- [ ] Next skill recommendation is `workflow-build`
