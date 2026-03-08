/**
 * Codec interface for serialization formats.
 *
 * A codec handles the core serialize/deserialize logic for a specific
 * wire format (devalue, CBOR, JSON, etc.). The format prefix, encryption,
 * and mode-specific reducers/revivers are handled at a higher layer.
 */

import type { Reducers, Revivers, SerializationFormatType } from './types.js';

export interface Codec {
  /** The 4-character format prefix identifier (e.g. "devl", "cbor", "json") */
  readonly formatPrefix: SerializationFormatType;

  /**
   * Serialize a value to bytes using the given reducers for custom types.
   *
   * @param value - The value to serialize
   * @param reducers - Type-specific reducers (e.g. Date → ISO string)
   * @returns The serialized payload (without format prefix — that's added by the format layer)
   */
  serialize(value: unknown, reducers: Partial<Reducers>): Uint8Array;

  /**
   * Deserialize bytes back to a value using the given revivers for custom types.
   *
   * @param data - The serialized payload (without format prefix)
   * @param revivers - Type-specific revivers (e.g. ISO string → Date)
   * @returns The deserialized value
   */
  deserialize(data: Uint8Array, revivers: Partial<Revivers>): unknown;

  /**
   * Deserialize legacy (pre-format-prefix) data.
   * Used for backwards compatibility with specVersion 1 runs that stored
   * data as plain JSON arrays instead of binary.
   *
   * @param data - The legacy data (typically a JSON array from devalue's unflatten format)
   * @param revivers - Type-specific revivers
   * @returns The deserialized value
   */
  deserializeLegacy?(data: unknown, revivers: Partial<Revivers>): unknown;
}
