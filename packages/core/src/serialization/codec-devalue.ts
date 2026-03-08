/**
 * Devalue codec implementation.
 *
 * Uses the `devalue` library for serialization with custom reducers/revivers
 * for Workflow DevKit types (Date, Error, Map, Set, typed arrays, classes, etc.).
 */

import { parse, stringify, unflatten } from 'devalue';
import { SerializationFormat } from './types.js';
import type { Codec } from './codec.js';
import type { Reducers, Revivers } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The devalue codec. Serializes values to a UTF-8 encoded string using
 * devalue's `stringify()` and deserializes using `parse()`.
 *
 * Custom types are handled via reducers (serialize) and revivers (deserialize)
 * which are composed by the mode-specific modules (workflow, step, client).
 */
export const devalueCodec: Codec = {
  formatPrefix: SerializationFormat.DEVALUE_V1,

  serialize(value: unknown, reducers: Partial<Reducers>): Uint8Array {
    const str = stringify(
      value,
      reducers as Record<string, (value: any) => any>
    );
    return encoder.encode(str);
  },

  deserialize(data: Uint8Array, revivers: Partial<Revivers>): unknown {
    const str = decoder.decode(data);
    return parse(str, revivers as Record<string, (value: any) => any>);
  },

  deserializeLegacy(data: unknown, revivers: Partial<Revivers>): unknown {
    // Legacy specVersion 1 runs stored data as plain JSON arrays
    // (devalue's unflatten format, not binary)
    return unflatten(
      data as any[],
      revivers as Record<string, (value: any) => any>
    );
  },
};
