/**
 * Step mode serialization.
 *
 * Used by the step handler for serializing step return values and
 * deserializing step arguments. Supports encryption as a composable layer.
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { DevalueError } from 'devalue';
import { runtimeLogger } from '../logger.js';
import { devalueCodec } from './codec-devalue.js';
import {
  encrypt as encryptData,
  decrypt as decryptData,
  type CryptoKey,
} from './encryption.js';
import { decodeFormatPrefix, encodeWithFormatPrefix } from './format.js';
import { getClassReducers, getClassRevivers } from './reducers/class.js';
import { getCommonReducers, getCommonRevivers } from './reducers/common.js';
import { SerializationFormat, type Reducers, type Revivers } from './types.js';

// ---- Reducer/Reviver composition ----

function getStepReducers(
  global: Record<string, any> = globalThis
): Partial<Reducers> {
  return {
    ...getCommonReducers(global),
    ...getClassReducers(),
    // Note: Stream reducers for step mode need additional parameters
    // (ops, runId, cryptoKey). These are composed at call sites that
    // need stream support. For basic step serialization, common + class
    // reducers are sufficient.
  };
}

function getStepRevivers(
  global: Record<string, any> = globalThis
): Partial<Revivers> {
  return {
    ...getCommonRevivers(global),
    ...getClassRevivers(global),
    // StepFunction reviver is intentionally excluded in step mode —
    // step functions should not be passed as step return values.
  };
}

// ---- Public API ----

/**
 * Serialize a value from the step execution environment.
 *
 * @param value - The value to serialize
 * @param encryptionKey - Optional encryption key
 * @returns Format-prefixed (and optionally encrypted) serialized bytes
 */
export async function serialize(
  value: unknown,
  encryptionKey?: CryptoKey
): Promise<Uint8Array | unknown> {
  try {
    const payload = devalueCodec.serialize(value, getStepReducers());
    const prefixed = encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    ) as Uint8Array;
    return encryptData(prefixed, encryptionKey);
  } catch (error) {
    throw new WorkflowRuntimeError(
      formatSerializationError('step value', error),
      { slug: 'serialization-failed', cause: error }
    );
  }
}

/**
 * Deserialize a value for the step execution environment.
 *
 * @param data - Format-prefixed (and optionally encrypted) serialized bytes
 * @param encryptionKey - Optional encryption key
 * @returns The deserialized value
 */
export async function deserialize(
  data: Uint8Array | unknown,
  encryptionKey?: CryptoKey
): Promise<unknown> {
  const decrypted = await decryptData(data, encryptionKey);

  // Legacy specVersion 1: data is not binary
  if (!(decrypted instanceof Uint8Array)) {
    if (devalueCodec.deserializeLegacy) {
      return devalueCodec.deserializeLegacy(decrypted, getStepRevivers());
    }
    throw new Error(
      'Cannot deserialize non-binary data without legacy support'
    );
  }

  const { format, payload } = decodeFormatPrefix(decrypted);

  if (format === SerializationFormat.DEVALUE_V1) {
    return devalueCodec.deserialize(payload, getStepRevivers());
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
