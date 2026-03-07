import { z } from 'zod';

export const SnapshotMetadataSchema = z.object({
  /** The last event ID that was processed before this snapshot was taken */
  lastEventId: z.string().nullable(),
  /** Timestamp when the snapshot was created */
  createdAt: z.coerce.date(),
});

export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;
