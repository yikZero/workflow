/**
 * Workflow mode serialization.
 *
 * This module provides serialize/deserialize for use inside the workflow
 * execution environment (QuickJS VM or Node.js vm). It is:
 * - Synchronous (no async operations)
 * - No encryption (encryption is handled outside the VM on the host side)
 * - Includes class, step function, and common type reducers/revivers
 *
 * This module is designed to be bundled into the workflow code by esbuild
 * and executed inside the sandboxed VM.
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { DevalueError } from 'devalue';
import { runtimeLogger } from '../logger.js';
import { devalueCodec } from './codec-devalue.js';
import { decodeFormatPrefix, encodeWithFormatPrefix } from './format.js';
import { getClassReducers, getClassRevivers } from './reducers/class.js';
import { getCommonReducers, getCommonRevivers } from './reducers/common.js';
import {
  getStepFunctionReducer,
  getStepFunctionReviver,
} from './reducers/step-function.js';
import { SerializationFormat, type Reducers, type Revivers } from './types.js';

// ---- Reducer/Reviver composition ----

function getWorkflowReducers(
  global: Record<string, any> = globalThis
): Partial<Reducers> {
  return {
    ...getCommonReducers(global),
    ...getClassReducers(),
    ...getStepFunctionReducer(),
    // Note: ReadableStream/WritableStream reducers for workflow mode
    // are handled separately since they depend on workflow-specific symbols.
    // They can be merged in here when stream support is added to the
    // snapshot runtime.
  };
}

function getWorkflowRevivers(
  global: Record<string, any> = globalThis
): Partial<Revivers> {
  return {
    ...getCommonRevivers(global),
    ...getClassRevivers(global),
    ...getStepFunctionReviver(global),
  };
}

// ---- Public API ----

/**
 * Serialize a value for storage/transmission from the workflow environment.
 *
 * Returns a Uint8Array with the "devl" format prefix.
 * No encryption is applied — the host handles that separately.
 *
 * @param value - The value to serialize
 * @returns Format-prefixed serialized bytes
 */
export function serialize(value: unknown): Uint8Array {
  try {
    const payload = devalueCodec.serialize(value, getWorkflowReducers());
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
 * Accepts format-prefixed Uint8Array (current format) or legacy plain
 * data (specVersion 1 compat).
 *
 * @param data - Format-prefixed serialized bytes, or legacy data
 * @returns The deserialized value
 */
export function deserialize(data: Uint8Array | unknown): unknown {
  // Legacy specVersion 1: data is not binary
  if (!(data instanceof Uint8Array)) {
    if (devalueCodec.deserializeLegacy) {
      return devalueCodec.deserializeLegacy(data, getWorkflowRevivers());
    }
    throw new Error(
      'Cannot deserialize non-binary data without legacy support'
    );
  }

  const { format, payload } = decodeFormatPrefix(data);

  if (format === SerializationFormat.DEVALUE_V1) {
    return devalueCodec.deserialize(payload, getWorkflowRevivers());
  }

  throw new Error(`Unsupported serialization format: ${format}`);
}

// ---- Helpers ----

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
