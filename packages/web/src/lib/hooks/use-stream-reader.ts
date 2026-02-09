'use client';

import { useEffect, useRef, useState } from 'react';
import { readStream } from '@/lib/workflow-api-client';
import type { EnvMap } from '@/server/workflow-server-actions';

export interface Chunk {
  id: number;
  text: string;
}

export function useStreamReader(env: EnvMap, streamId: string | null) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chunkIdRef = useRef(0);

  useEffect(() => {
    setChunks([]);
    setError(null);
    chunkIdRef.current = 0;

    if (!streamId) {
      setIsLive(false);
      return;
    }

    let mounted = true;
    abortControllerRef.current = new AbortController();
    setIsLive(true);

    const handleStreamEnd = () => {
      if (mounted) {
        setIsLive(false);
      }
    };

    const handleStreamError = (err: unknown) => {
      if (mounted) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLive(false);
      }
    };

    const addChunk = (value: unknown) => {
      if (mounted && value !== undefined && value !== null) {
        const chunkId = chunkIdRef.current++;
        let text: string;
        if (typeof value === 'string') {
          text = value;
        } else if (value instanceof Uint8Array) {
          text = new TextDecoder().decode(value);
        } else if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
          const buf =
            value instanceof ArrayBuffer
              ? value
              : value.buffer.slice(
                  value.byteOffset,
                  value.byteOffset + value.byteLength
                );
          text = new TextDecoder().decode(buf);
        } else {
          text = JSON.stringify(value, null, 2);
        }
        // Attempt to pretty-print if the decoded text is JSON
        if (text.startsWith('{') || text.startsWith('[')) {
          try {
            text = JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            // not JSON, keep as-is
          }
        }
        setChunks((prev) => [...prev, { id: chunkId, text }]);
      }
    };

    const processStreamChunks = async (
      reader: ReadableStreamDefaultReader<unknown>
    ) => {
      for (;;) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { value, done } = await reader.read();

        if (done) {
          handleStreamEnd();
          break;
        }

        addChunk(value);
      }
    };

    const readStreamData = async () => {
      try {
        const stream = await readStream(env, streamId);
        const reader = stream.getReader();
        await processStreamChunks(reader);
      } catch (err) {
        handleStreamError(err);
      }
    };

    void readStreamData();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [env, streamId]);

  return {
    chunks,
    isLive,
    error,
  };
}
