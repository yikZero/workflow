import { gunzipSync, gzipSync } from 'node:zlib';
import type { SnapshotMetadata, Storage } from '@workflow/world';
import { eq } from 'drizzle-orm';
import { type Drizzle, Schema } from './drizzle/index.js';

/**
 * Snapshot storage for world-postgres.
 *
 * Binary snapshot data is stored gzip-compressed in the `data` column of
 * the `workflow.workflow_snapshots` table. Each run has at most one row —
 * `save()` uses an upsert to replace the previous snapshot when a newer
 * suspension point is reached.
 */
export function createSnapshotsStorage(drizzle: Drizzle): Storage['snapshots'] {
  const { snapshots } = Schema;

  return {
    async save(
      runId: string,
      data: Uint8Array,
      metadata: SnapshotMetadata
    ): Promise<void> {
      const compressed = gzipSync(data);

      await drizzle
        .insert(snapshots)
        .values({
          runId,
          data: Buffer.from(compressed),
          eventsCursor: metadata.eventsCursor,
          createdAt: metadata.createdAt,
        })
        .onConflictDoUpdate({
          target: snapshots.runId,
          set: {
            data: Buffer.from(compressed),
            eventsCursor: metadata.eventsCursor,
            createdAt: metadata.createdAt,
          },
        });
    },

    async load(
      runId: string
    ): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
      const [row] = await drizzle
        .select()
        .from(snapshots)
        .where(eq(snapshots.runId, runId))
        .limit(1);

      if (!row) return null;

      // Decompress the snapshot data.
      const decompressed = gunzipSync(row.data);
      const data = new Uint8Array(
        decompressed.buffer,
        decompressed.byteOffset,
        decompressed.byteLength
      );

      return {
        data,
        metadata: {
          eventsCursor: row.eventsCursor,
          createdAt: row.createdAt,
        },
      };
    },

    async delete(runId: string): Promise<void> {
      await drizzle.delete(snapshots).where(eq(snapshots.runId, runId));
    },
  };
}
