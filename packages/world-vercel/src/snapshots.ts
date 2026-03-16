import { gunzipSync, gzipSync } from 'node:zlib';
import { WorkflowAPIError } from '@workflow/errors';
import type { SnapshotMetadata, Storage } from '@workflow/world';
import { getDispatcher } from './http-client.js';
import { type APIConfig, getHttpConfig } from './utils.js';

/**
 * Content encoding used for snapshot storage.
 * Sent as X-Snapshot-Content-Encoding header so the server can persist it
 * alongside the blob. On load, the SDK reads this header to know how to
 * decompress. This allows changing the algorithm in the future without
 * breaking existing snapshots.
 */
const SNAPSHOT_CONTENT_ENCODING = 'gzip';

/**
 * Create snapshot storage backed by the workflow-server API.
 *
 * Snapshot data is gzip-compressed by the SDK before sending and
 * decompressed after receiving. The server stores the raw (compressed)
 * bytes and tracks the encoding via S3 user metadata.
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
      const { baseUrl, headers } = await getHttpConfig(config);
      const url = `${baseUrl}/v2/runs/${encodeURIComponent(runId)}/snapshot`;

      // Compress the snapshot data before sending
      const compressed = gzipSync(data);

      headers.set('Content-Type', 'application/octet-stream');
      headers.set('X-Snapshot-Content-Encoding', SNAPSHOT_CONTENT_ENCODING);
      headers.set('X-Snapshot-Events-Cursor', metadata.eventsCursor ?? '');
      headers.set('X-Snapshot-Created-At', metadata.createdAt.toISOString());

      const response = await fetch(url, {
        method: 'PUT',
        body: compressed,
        headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- undici dispatcher
        dispatcher: getDispatcher(),
      } as any);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new WorkflowAPIError(
          `PUT /v2/runs/${runId}/snapshot -> HTTP ${response.status}: ${text}`,
          { url, status: response.status }
        );
      }

      // Consume the response body to release the connection
      await response.text();
    },

    async load(
      runId: string
    ): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
      const { baseUrl, headers } = await getHttpConfig(config);
      const url = `${baseUrl}/v2/runs/${encodeURIComponent(runId)}/snapshot`;

      headers.set('Accept', 'application/octet-stream');

      const response = await fetch(url, {
        method: 'GET',
        headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- undici dispatcher
        dispatcher: getDispatcher(),
      } as any);

      if (response.status === 404) {
        // Consume the response body to release the connection
        await response.text().catch(() => {});
        return null;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new WorkflowAPIError(
          `GET /v2/runs/${runId}/snapshot -> HTTP ${response.status}: ${text}`,
          { url, status: response.status }
        );
      }

      const buffer = await response.arrayBuffer();
      let data = new Uint8Array(buffer);

      // Decompress based on the encoding header from the server
      const contentEncoding =
        response.headers.get('X-Snapshot-Content-Encoding') || null;
      if (contentEncoding === 'gzip') {
        data = gunzipSync(data);
      }

      const eventsCursor =
        response.headers.get('X-Snapshot-Events-Cursor') || null;
      const createdAtStr = response.headers.get('X-Snapshot-Created-At');
      const createdAt = createdAtStr ? new Date(createdAtStr) : new Date();

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
        throw new WorkflowAPIError(
          `DELETE /v2/runs/${runId}/snapshot -> HTTP ${response.status}: ${text}`,
          { url, status: response.status }
        );
      }

      // Consume the response body to release the connection
      await response.text();
    },
  };
}
