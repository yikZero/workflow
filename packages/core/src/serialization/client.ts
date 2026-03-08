/**
 * Client (external) mode serialization.
 *
 * Used when starting workflows from the client side (serializing workflow
 * arguments) and when receiving workflow return values. Supports encryption.
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
import { SerializationFormat } from './types.js';

/**
 * Serialize a value from the client environment (e.g. workflow arguments).
 */
export async function serialize(
  value: unknown,
  encryptionKey?: CryptoKey
): Promise<Uint8Array | unknown> {
  try {
    const payload = devalueCodec.serialize(value, 'client');
    const prefixed = encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    ) as Uint8Array;
    return encryptData(prefixed, encryptionKey);
  } catch (error) {
    throw new WorkflowRuntimeError(
      formatSerializationError('client value', error),
      { slug: 'serialization-failed', cause: error }
    );
  }
}

/**
 * Deserialize a value for the client environment (e.g. workflow return value).
 */
export async function deserialize(
  data: Uint8Array | unknown,
  encryptionKey?: CryptoKey
): Promise<unknown> {
  const decrypted = await decryptData(data, encryptionKey);

  if (!(decrypted instanceof Uint8Array)) {
    if (devalueCodec.deserializeLegacy) {
      return devalueCodec.deserializeLegacy(decrypted, 'client');
    }
    throw new Error(
      'Cannot deserialize non-binary data without legacy support'
    );
  }

  const { format, payload } = decodeFormatPrefix(decrypted);

  if (format === SerializationFormat.DEVALUE_V1) {
    return devalueCodec.deserialize(payload, 'client');
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
