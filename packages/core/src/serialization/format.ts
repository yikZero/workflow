/**
 * Format prefix system for serialized payloads.
 *
 * All serialized payloads are prefixed with a 4-byte format identifier that
 * allows the deserializer to determine how to decode the payload. This enables:
 *
 * 1. Self-describing payloads — the World layer is agnostic to serialization format
 * 2. Gradual migration — old runs keep working, new runs can use new formats
 * 3. Composability — encryption can wrap any format ("encr" wrapping "devl")
 * 4. Debugging — raw data inspection immediately reveals the format
 *
 * Format: [4 bytes: format identifier][payload]
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { SerializationFormat, type SerializationFormatType } from './types.js';

/** Length of the format prefix in bytes */
const FORMAT_PREFIX_LENGTH = 4;

const formatEncoder = new TextEncoder();
const formatDecoder = new TextDecoder();

/**
 * Encode a payload with a format prefix.
 *
 * @param format - The format identifier (must be exactly 4 ASCII characters)
 * @param payload - The serialized payload bytes
 * @returns A new Uint8Array with format prefix prepended
 */
export function encodeWithFormatPrefix(
  format: SerializationFormatType,
  payload: Uint8Array | unknown
): Uint8Array | unknown {
  if (!(payload instanceof Uint8Array)) {
    return payload;
  }

  const prefixBytes = formatEncoder.encode(format);
  if (prefixBytes.length !== FORMAT_PREFIX_LENGTH) {
    throw new Error(
      `Format identifier must be exactly ${FORMAT_PREFIX_LENGTH} ASCII characters, got "${format}" (${prefixBytes.length} bytes)`
    );
  }

  const result = new Uint8Array(FORMAT_PREFIX_LENGTH + payload.length);
  result.set(prefixBytes, 0);
  result.set(payload, FORMAT_PREFIX_LENGTH);
  return result;
}

/**
 * Peek at the format prefix without consuming it.
 *
 * @param data - The format-prefixed data
 * @returns The format identifier, or null if data is legacy/non-binary
 */
export function peekFormatPrefix(
  data: Uint8Array | unknown
): SerializationFormatType | null {
  if (!(data instanceof Uint8Array) || data.length < FORMAT_PREFIX_LENGTH) {
    return null;
  }
  const prefixBytes = data.subarray(0, FORMAT_PREFIX_LENGTH);
  const format = formatDecoder.decode(prefixBytes);
  const knownFormats = Object.values(SerializationFormat) as string[];
  if (!knownFormats.includes(format)) {
    return null;
  }
  return format as SerializationFormatType;
}

/**
 * Check if data is encrypted (has 'encr' format prefix).
 */
export function isEncrypted(data: Uint8Array | unknown): boolean {
  return peekFormatPrefix(data) === SerializationFormat.ENCRYPTED;
}

/**
 * Decode a format-prefixed payload.
 *
 * @param data - The format-prefixed data
 * @returns An object with the format identifier and payload
 * @throws Error if the data is too short or has an unknown format
 */
export function decodeFormatPrefix(data: Uint8Array | unknown): {
  format: SerializationFormatType;
  payload: Uint8Array;
} {
  // Compat for legacy specVersion 1 runs that don't have a format prefix,
  // and don't have a binary payload
  if (!(data instanceof Uint8Array)) {
    return {
      format: SerializationFormat.DEVALUE_V1,
      payload: new TextEncoder().encode(JSON.stringify(data)),
    };
  }

  if (data.length < FORMAT_PREFIX_LENGTH) {
    throw new Error(
      `Data too short to contain format prefix: expected at least ${FORMAT_PREFIX_LENGTH} bytes, got ${data.length}`
    );
  }

  const prefixBytes = data.subarray(0, FORMAT_PREFIX_LENGTH);
  const format = formatDecoder.decode(prefixBytes);

  const knownFormats = Object.values(SerializationFormat) as string[];
  if (!knownFormats.includes(format)) {
    throw new WorkflowRuntimeError(
      `Unknown serialization format: "${format}". Known formats: ${knownFormats.join(', ')}`
    );
  }

  const payload = data.subarray(FORMAT_PREFIX_LENGTH);
  return { format: format as SerializationFormatType, payload };
}
