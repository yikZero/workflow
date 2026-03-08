/**
 * Workflow mode serialization.
 *
 * Provides serialize/deserialize for use inside the workflow execution
 * environment (QuickJS VM or Node.js vm). It is:
 * - Synchronous (no async operations)
 * - No encryption (encryption is handled outside the VM on the host side)
 *
 * Designed to be bundled into the workflow code by esbuild and executed
 * inside the sandboxed VM.
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { DevalueError } from 'devalue';
import { runtimeLogger } from '../logger.js';
import { devalueCodec } from './codec-devalue.js';
import { decodeFormatPrefix, encodeWithFormatPrefix } from './format.js';
import { SerializationFormat } from './types.js';

/**
 * Serialize a value for storage/transmission from the workflow environment.
 *
 * @param value - The value to serialize
 * @returns Format-prefixed serialized bytes
 */
export function serialize(value: unknown): Uint8Array {
  try {
    const payload = devalueCodec.serialize(value, 'workflow');
    return encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    ) as Uint8Array;
  } catch (error) {
    throw new WorkflowRuntimeError(
      formatSerializationError('workflow value', error),
      { slug: 'serialization-failed', cause: error }
    );
  }
}

/**
 * Deserialize a value received in the workflow environment.
 *
 * @param data - Format-prefixed serialized bytes, or legacy data
 * @returns The deserialized value
 */
export function deserialize(data: Uint8Array | unknown): unknown {
  if (!(data instanceof Uint8Array)) {
    if (devalueCodec.deserializeLegacy) {
      return devalueCodec.deserializeLegacy(data, 'workflow');
    }
    throw new Error(
      'Cannot deserialize non-binary data without legacy support'
    );
  }

  const { format, payload } = decodeFormatPrefix(data);

  if (format === SerializationFormat.DEVALUE_V1) {
    return devalueCodec.deserialize(payload, 'workflow');
  }

  throw new Error(`Unsupported serialization format: ${format}`);
}

function formatSerializationError(context: string, error: unknown): string {
  const verb = context.includes('return value') ? 'returning' : 'passing';
  let message = `Failed to serialize ${context}`;
  if (error instanceof DevalueError && error.path) {
    message += ` at path "${error.path}"`;
  }
  message += `. Ensure you're ${verb} serializable types (plain objects, arrays, primitives, Date, RegExp, Map, Set).`;
  if (error instanceof DevalueError && error.value !== undefined) {
    runtimeLogger.error('Serialization failed', {
      context,
      problematicValue: error.value,
    });
  }
  return message;
}
