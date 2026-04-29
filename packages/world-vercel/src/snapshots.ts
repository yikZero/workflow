import { gunzipSync } from 'node:zlib';
import { WorkflowWorldError } from '@workflow/errors';
import type { SnapshotMetadata, Storage } from '@workflow/world';
import { request as undiciRequest } from 'undici';
import { getDispatcher } from './http-client.js';
import { type APIConfig, getHttpConfig } from './utils.js';

/**
 * Convert a Web `Headers` object into a plain record for undici's
 * lower-level `request()` API. Headers in undici-request take
 * `Record<string, string | string[]>`, not the Headers object.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of headers) {
    record[key] = value;
  }
  return record;
}

/**
 * Create snapshot storage backed by the workflow-server API.
 *
 * Compression and encryption are now handled by `@workflow/core`'s
 * snapshot entrypoint (`compress(snapshot) → encrypt → save`). This
 * world layer treats the bytes as opaque — it does NOT add its own
 * gzip wrapper, since the bytes arriving here are already encrypted
 * (and encryption produces ciphertext that doesn't compress).
 *
 * For backward compatibility, the load path still honors the
 * `X-Snapshot-Content-Encoding: gzip` response header that older
 * stored blobs were written with — those will be gunzipped on the
 * way out. New blobs from the current SDK arrive without any
 * Content-Encoding metadata, so the gunzip step is skipped and the
 * bytes are returned verbatim for the core to decrypt + decompress.
 *
 * Snapshot endpoints use raw binary transfer:
 *   - PUT  /v2/runs/:runId/snapshot — binary body, metadata in headers
 *   - GET  /v2/runs/:runId/snapshot — binary response, metadata in headers
 *   - DELETE /v2/runs/:runId/snapshot — no body
 */
export function createSnapshotsStorage(
  config?: APIConfig
): Storage['snapshots'] {
  return {
    async save(
      runId: string,
      data: Uint8Array,
      metadata: SnapshotMetadata
    ): Promise<void> {
      const t0 = performance.now();
      const { baseUrl, headers } = await getHttpConfig(config);
      const url = `${baseUrl}/v2/runs/${encodeURIComponent(runId)}/snapshot`;

      // Bytes arrive opaquely from the core (compress(plain) → encrypt
      // pipeline). Don't compress again — encrypted bytes don't
      // compress, and the core is responsible for the codec choice.
      // Don't set X-Snapshot-Content-Encoding either; old blobs
      // written under that scheme can still be loaded back below.
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('X-Snapshot-Events-Cursor', metadata.eventsCursor ?? '');
      headers.set('X-Snapshot-Created-At', metadata.createdAt.toISOString());

      // Use undici.request() rather than the global fetch() because
      // fetch() + RetryAgent is broken for Buffer/Uint8Array bodies:
      // fetch wraps the body in a one-shot ReadableStream (per the
      // WHATWG fetch spec), so when the RetryAgent retries (on 5xx or
      // network errors), the second attempt sends 0 bytes and undici
      // throws `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH`. The lower-level
      // `request()` API hands the Buffer to the connection layer
      // directly, which can be replayed on retry.
      //
      // Upstream context: nodejs/undici#3288 (filed May 2024) reported
      // this exact failure. The "fix" in nodejs/undici#3294 made
      // RetryAgent skip stateful bodies rather than rewind them, and
      // the maintainers explicitly recommended switching to
      // `undici.request()` for any retried request with a body. Don't
      // simplify this back to `fetch()` without first verifying that
      // upstream now copies Buffers across retries.
      //
      // Snapshot bodies are 5-15 MB so the bug fires constantly under
      // network turbulence; a single failed save poisons the run
      // (handler returns 500 -> queue retries handler -> save fails
      // again -> 5xx loop until the run TTL).
      const putStart = performance.now();
      const response = await undiciRequest(url, {
        method: 'PUT',
        body: data,
        headers: headersToRecord(headers),
        dispatcher: getDispatcher(),
      });
      const putDurationMs = Math.round(performance.now() - putStart);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const text = await response.body.text().catch(() => '');
        throw new WorkflowWorldError(
          `PUT /v2/runs/${runId}/snapshot -> HTTP ${response.statusCode}: ${text}`,
          { url, status: response.statusCode }
        );
      }

      // Consume the response body to release the connection
      await response.body.text();

      // CI-visible diagnostic: actual on-the-wire snapshot bytes and
      // the HTTP-PUT cost. Mirrors the SNAPSHOT_DIAG checkpoint format
      // from `@workflow/core` so a wedged run's entire save/load
      // lifecycle is grep-able by runId in Vercel function logs.
      // Emitted at warn level (always-on, no DEBUG required).
      console.warn('[Workflow] WORLD_SNAPSHOT_DIAG', {
        op: 'save',
        runId,
        // Bytes received from the core — already compressed and
        // encrypted upstream. The world transports them opaquely.
        wireBytes: data.byteLength,
        putDurationMs,
        totalDurationMs: Math.round(performance.now() - t0),
      });
    },

    async load(
      runId: string
    ): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
      const t0 = performance.now();
      const { baseUrl, headers } = await getHttpConfig(config);
      const url = `${baseUrl}/v2/runs/${encodeURIComponent(runId)}/snapshot`;

      headers.set('Accept', 'application/octet-stream');

      const getStart = performance.now();
      const response = await fetch(url, {
        method: 'GET',
        headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- undici dispatcher
        dispatcher: getDispatcher(),
      } as any);
      const getDurationMs = Math.round(performance.now() - getStart);

      if (response.status === 404) {
        // Consume the response body to release the connection
        await response.text().catch(() => {});
        // Diagnostic: emit the not-found case so we can correlate the
        // skip-load fast-path in core with whatever the world saw.
        console.warn('[Workflow] WORLD_SNAPSHOT_DIAG', {
          op: 'load',
          runId,
          outcome: 'not_found',
          getDurationMs,
          totalDurationMs: Math.round(performance.now() - t0),
        });
        return null;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new WorkflowWorldError(
          `GET /v2/runs/${runId}/snapshot -> HTTP ${response.status}: ${text}`,
          { url, status: response.status }
        );
      }

      const buffer = await response.arrayBuffer();
      const wireBytes = buffer.byteLength;
      let data = new Uint8Array(buffer);

      // BACKWARD COMPAT: older blobs were saved with the SDK applying
      // its own gzip + an `X-Snapshot-Content-Encoding: gzip` header.
      // New blobs (current SDK) arrive opaque — already
      // compressed+encrypted by the core — and have no
      // Content-Encoding metadata. When this header is present we
      // gunzip; otherwise we pass bytes through verbatim and let the
      // core's `decompress()` handle the modern format-prefix
      // (gzip/zstd) on the inner payload.
      const contentEncoding =
        response.headers.get('X-Snapshot-Content-Encoding') || null;
      let gunzipDurationMs: number | undefined;
      if (contentEncoding === 'gzip') {
        const gunzipStart = performance.now();
        data = gunzipSync(data);
        gunzipDurationMs = Math.round(performance.now() - gunzipStart);
      }

      const eventsCursor =
        response.headers.get('X-Snapshot-Events-Cursor') || null;
      const createdAtStr = response.headers.get('X-Snapshot-Created-At');
      const createdAt = createdAtStr ? new Date(createdAtStr) : new Date();

      // CI-visible diagnostic: actual on-the-wire snapshot bytes and
      // gunzip cost. Same format/pairing as the save side above so the
      // entire snapshot save/load lifecycle is grep-able from Vercel
      // function logs by runId.
      console.warn('[Workflow] WORLD_SNAPSHOT_DIAG', {
        op: 'load',
        runId,
        outcome: 'ok',
        // On-the-wire body size returned by the workflow-server.
        wireBytes,
        // After gunzip (if applicable). Equal to wireBytes when the
        // server returns plaintext (no Content-Encoding header).
        decompressedBytes: data.byteLength,
        compressionRatio:
          wireBytes > 0 ? +(data.byteLength / wireBytes).toFixed(2) : 0,
        getDurationMs,
        gunzipDurationMs,
        totalDurationMs: Math.round(performance.now() - t0),
      });

      return {
        data,
        metadata: {
          eventsCursor: eventsCursor || null,
          createdAt,
        },
      };
    },

    async delete(runId: string): Promise<void> {
      const { baseUrl, headers } = await getHttpConfig(config);
      const url = `${baseUrl}/v2/runs/${encodeURIComponent(runId)}/snapshot`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- undici dispatcher
        dispatcher: getDispatcher(),
      } as any);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new WorkflowWorldError(
          `DELETE /v2/runs/${runId}/snapshot -> HTTP ${response.status}: ${text}`,
          { url, status: response.status }
        );
      }

      // Consume the response body to release the connection
      await response.text();
    },
  };
}
