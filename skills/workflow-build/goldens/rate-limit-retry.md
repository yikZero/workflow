# Golden Scenario: Rate-Limit Retry

## Scenario

A data sync workflow that fetches records from a rate-limited third-party API in pages, transforms each page, and upserts results into a database. The API returns HTTP 429 when rate-limited.

## What the Build Skill Should Catch

### Phase 2 — Traps Flagged

1. **Retry semantics** — HTTP 429 (rate limit) is a textbook transient failure. The fetch step must use `RetryableError`, not `FatalError`. Reserve `FatalError` for permanent failures like HTTP 401/403.
2. **Idempotency keys** — The upsert step writes to a database. Use a key like `sync:${syncId}:page:${pageNumber}` to prevent duplicate writes on replay.
3. **Pass-by-value / serialization issues** — If fetching returns large record sets, ensure payloads are JSON-serializable and within event log limits.

### Phase 3 — Failure Modes Decided

- `fetchPage`: `RetryableError` with `maxRetries: 5` for HTTP 429 and network errors. `FatalError` for HTTP 401/403 (auth failure — retrying won't help).
- `transformRecords`: `FatalError` — a transformation error is a code bug, not transient. Retrying won't fix it.
- `upsertRecords`: `RetryableError` with `maxRetries: 3` for transient database errors. Idempotency key from `syncId` + page number.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError, getWritable } from "workflow";

const fetchPage = async (apiUrl: string, page: number, pageSize: number) => {
  "use step";
  const response = await fetch(
    `${apiUrl}?page=${page}&pageSize=${pageSize}`
  );

  if (response.status === 429) {
    throw new RetryableError("Rate limited — will retry with backoff");
  }
  if (response.status === 401 || response.status === 403) {
    throw new FatalError("Authentication failed — cannot retry");
  }
  if (!response.ok) {
    throw new RetryableError(`API error ${response.status}`);
  }

  return response.json();
};

const transformRecords = async (records: ApiRecord[]) => {
  "use step";
  // Pure transformation — FatalError if this fails (code bug)
  return records.map((r) => ({
    id: r.externalId,
    name: r.fields.name,
    updatedAt: r.fields.modified,
  }));
};

const upsertRecords = async (
  syncId: string,
  page: number,
  records: LocalRecord[]
) => {
  "use step";
  await db.upsert({
    idempotencyKey: `sync:${syncId}:page:${page}`,
    records,
  });
  return records.length;
};

export default async function dataSync(
  syncId: string,
  apiUrl: string,
  pageSize: number
) {
  const stream = getWritable("sync-progress");

  let page = 0;
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchPage(apiUrl, page, pageSize);
    const transformed = await transformRecords(data.records);
    const count = await upsertRecords(syncId, page, transformed);

    totalSynced += count;
    hasMore = data.hasNextPage;
    page++;
  }

  return { syncId, totalSynced, pages: page };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import dataSync from "../workflows/data-sync";

describe("dataSync", () => {
  it("syncs all pages", async () => {
    const run = await start(dataSync, ["sync-1", "https://api.example.com/records", 100]);
    const result = await run.returnValue;
    expect(result.totalSynced).toBeGreaterThan(0);
  });

  it("retries on rate limit (429)", async () => {
    // API returns 429 on first attempt, 200 on second
    const run = await start(dataSync, ["sync-2", "https://api.example.com/records", 50]);
    await expect(run.returnValue).resolves.toBeDefined();
  });

  it("fails permanently on auth error", async () => {
    // API returns 401
    const run = await start(dataSync, ["sync-3", "https://api.example.com/records", 50]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
  });
});
```

## Checklist Items Exercised

- Retry semantics (`RetryableError` vs `FatalError`)
- Idempotency keys
- Pass-by-value / serialization issues
- Integration test coverage
