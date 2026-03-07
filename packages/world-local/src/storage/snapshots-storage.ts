import path from 'node:path';
import type { SnapshotMetadata } from '@workflow/world';
import { SnapshotMetadataSchema } from '@workflow/world';
import {
  deleteJSON,
  ensureDir,
  readBuffer,
  readJSON,
  write,
  writeJSON,
} from '../fs.js';

/**
 * Create the snapshots sub-storage for a local World implementation.
 *
 * Snapshots are stored as two files per run:
 *   {basedir}/snapshots/{runId}.bin   — serialized VM snapshot (binary)
 *   {basedir}/snapshots/{runId}.json  — metadata (lastEventId, createdAt)
 */
export function createSnapshotsStorage(basedir: string) {
  const snapshotsDir = path.join(basedir, 'snapshots');

  function binPath(runId: string): string {
    return path.join(snapshotsDir, `${runId}.bin`);
  }

  function metadataPath(runId: string): string {
    return path.join(snapshotsDir, `${runId}.json`);
  }

  return {
    async save(
      runId: string,
      data: Uint8Array,
      metadata: SnapshotMetadata
    ): Promise<void> {
      await ensureDir(snapshotsDir);
      // Write both files — overwrite any existing snapshot for this run
      await Promise.all([
        write(binPath(runId), Buffer.from(data), { overwrite: true }),
        writeJSON(metadataPath(runId), metadata, { overwrite: true }),
      ]);
    },

    async load(
      runId: string
    ): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
      // Read metadata first — if it doesn't exist, there's no snapshot
      const metadata = await readJSON(
        metadataPath(runId),
        SnapshotMetadataSchema
      );
      if (!metadata) return null;

      try {
        const dataBuf = await readBuffer(binPath(runId));
        return {
          data: new Uint8Array(
            dataBuf.buffer,
            dataBuf.byteOffset,
            dataBuf.byteLength
          ),
          metadata,
        };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async delete(runId: string): Promise<void> {
      await Promise.all([
        deleteJSON(binPath(runId)),
        deleteJSON(metadataPath(runId)),
      ]);
    },
  };
}
