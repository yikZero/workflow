import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { SnapshotMetadata } from '@workflow/world';
import { SnapshotMetadataSchema } from '@workflow/world';
import { z } from 'zod';
import { ensureDir, readBuffer, readJSON, write, writeJSON } from '../fs.js';

/**
 * Extended metadata stored on disk. Includes the binary data filename
 * so the correct file (and compression format) can be loaded.
 */
const LocalSnapshotMetadataSchema = SnapshotMetadataSchema.extend({
  /** Filename of the binary snapshot data (e.g. "{runId}.bin.gz") */
  dataFile: z.string().optional(),
});

/**
 * Create the snapshots sub-storage for a local World implementation.
 *
 * Snapshots are stored as two files per run:
 *   {basedir}/snapshots/{runId}.bin.gz — gzip-compressed VM snapshot
 *   {basedir}/snapshots/{runId}.json   — metadata (eventsCursor, createdAt, dataFile)
 *
 * The metadata includes a `dataFile` field with the binary filename so
 * the correct compression format can be determined on load. This allows
 * changing the compression format in the future without breaking existing
 * snapshots.
 */
export function createSnapshotsStorage(basedir: string) {
  const snapshotsDir = path.join(basedir, 'snapshots');

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

      const dataFile = `${runId}.bin.gz`;
      const compressed = gzipSync(data);

      await Promise.all([
        write(path.join(snapshotsDir, dataFile), compressed, {
          overwrite: true,
        }),
        writeJSON(
          metadataPath(runId),
          { ...metadata, dataFile },
          { overwrite: true }
        ),
      ]);
    },

    async load(
      runId: string
    ): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
      // Read metadata first — if it doesn't exist, there's no snapshot
      const localMetadata = await readJSON(
        metadataPath(runId),
        LocalSnapshotMetadataSchema
      );
      if (!localMetadata) return null;

      // Determine the binary file path. Use dataFile from metadata if
      // present, otherwise fall back to the legacy uncompressed path.
      const dataFile = localMetadata.dataFile ?? `${runId}.bin`;
      const dataPath = path.join(snapshotsDir, dataFile);

      try {
        const dataBuf = await readBuffer(dataPath);

        // Decompress if the file is gzip-compressed
        let data: Uint8Array;
        if (dataFile.endsWith('.gz')) {
          data = gunzipSync(dataBuf);
        } else {
          data = new Uint8Array(
            dataBuf.buffer,
            dataBuf.byteOffset,
            dataBuf.byteLength
          );
        }

        // Return only the SnapshotMetadata fields (strip dataFile)
        const { dataFile: _, ...metadata } = localMetadata;
        return { data, metadata };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async delete(runId: string): Promise<void> {
      // Read metadata to find the binary data filename
      const localMetadata = await readJSON(
        metadataPath(runId),
        LocalSnapshotMetadataSchema
      );

      const dataFile = localMetadata?.dataFile ?? `${runId}.bin`;

      await Promise.all([
        fs.rm(path.join(snapshotsDir, dataFile), { force: true }),
        fs.rm(metadataPath(runId), { force: true }),
      ]);
    },
  };
}
