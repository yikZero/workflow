# Golden Scenario: Rate-Limit Retry

## Scenario

A data sync workflow that fetches records from a rate-limited third-party API in pages, transforms each page, and upserts results into a database. The API returns HTTP 429 when rate-limited.

## Input Blueprint (Defective)

```json
{
  "name": "data-sync",
  "goal": "Sync records from external API to local database with pagination",
  "trigger": { "type": "cron", "entrypoint": "app/api/sync/route.ts" },
  "inputs": { "syncId": "string", "pageSize": "number" },
  "steps": [
    {
      "name": "fetchPage",
      "runtime": "step",
      "purpose": "Fetch one page of records from external API",
      "sideEffects": ["api.fetch"],
      "failureMode": "fatal",
      "maxRetries": 0
    },
    {
      "name": "transformRecords",
      "runtime": "step",
      "purpose": "Transform API records to local schema",
      "sideEffects": [],
      "failureMode": "default"
    },
    {
      "name": "upsertRecords",
      "runtime": "step",
      "purpose": "Write transformed records to database",
      "sideEffects": ["db.upsert"],
      "failureMode": "default"
    }
  ],
  "suspensions": [],
  "streams": [{ "namespace": "sync-progress", "payload": "{ page: number, total: number }" }],
  "tests": [
    {
      "name": "syncs all pages",
      "helpers": ["start"],
      "verifies": ["all records synced"]
    }
  ],
  "antiPatternsAvoided": []
}
```

## Expected Critical Fixes

1. **Retry semantics** — `fetchPage` uses `"fatal"` failure mode with `maxRetries: 0`, but HTTP 429 (rate limit) is a textbook transient failure. Must use `"retryable"` with appropriate `maxRetries` (e.g. 5) and backoff. Reserve `"fatal"` for permanent failures like HTTP 401/403.
2. **Idempotency keys** — `upsertRecords` writes to a database but has no `idempotencyKey`. Use `sync:${syncId}:page:${pageNumber}` to prevent duplicate writes on replay.

## Expected Should Fix

1. **Retry semantics** — `transformRecords` has no side effects and uses `"default"`. Pure transformations should use `"fatal"` since a transformation error is a code bug, not a transient issue — retrying won't help.
2. **Integration test coverage** — No test for the rate-limit path. Add a test that simulates a 429 response and verifies the workflow retries and eventually succeeds.
3. **Anti-pattern coverage** — `antiPatternsAvoided` is empty. Should include "Missing idempotency for side effects".
4. **Pass-by-value / serialization issues** — If `fetchPage` returns a large record set, ensure the full page payload is JSON-serializable and fits within event log limits. Consider pagination cursors over full record arrays.

## Checklist Items Exercised

- Retry semantics (`RetryableError` vs `FatalError`)
- Idempotency keys
- Pass-by-value / serialization issues
- Integration test coverage
