/**
 * Devalue codec implementation.
 *
 * Uses the `devalue` library for serialization. Handles custom types via
 * reducers (serialize) and revivers (deserialize) which are composed
 * internally based on the serialization mode.
 *
 * The reducer/reviver pattern is specific to devalue — other codecs
 * (CBOR, JSON) would handle types differently (e.g. CBOR supports Date,
 * typed arrays, Map, Set natively).
 */

import { parse, stringify, unflatten } from 'devalue';
import type { Codec, SerializationMode } from './codec.js';
import { getClassReducers, getClassRevivers } from './reducers/class.js';
import { getCommonReducers, getCommonRevivers } from './reducers/common.js';
import {
  getStepFunctionReducer,
  getStepFunctionReviver,
} from './reducers/step-function.js';
import { type Reducers, type Revivers, SerializationFormat } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---- Reducer/Reviver composition per mode ----
//
// Note: These modular mode modules (workflow.ts, step.ts, client.ts)
// are NOT used in the current runtime's event replay flow. All
// serialization in the current runtime goes through the dehydrate*/
// hydrate* functions in serialization.ts, which pass a `global`
// parameter (either the VM's sandboxed global or host globalThis)
// through to the reducer/reviver factories for correct `instanceof`
// checks across VM boundaries.
//
// The modular modules here default to `globalThis` and are designed
// for the future snapshot runtime where serialization runs inside the
// VM sandbox itself (where `globalThis` IS the VM's global). If the
// modular modules ever need to be called from the host side with a
// different `global`, the Codec interface would need to be extended
// to accept a `global` parameter.

function getReducersForMode(mode: SerializationMode): Partial<Reducers> {
  switch (mode) {
    case 'workflow':
      // Class/Instance MUST come before common (first-match-wins for Error subclasses)
      return {
        ...getClassReducers(),
        ...getStepFunctionReducer(),
        ...getCommonReducers(),
      };
    case 'step':
      return {
        ...getClassReducers(),
        ...getCommonReducers(),
      };
    case 'client':
      return {
        ...getClassReducers(),
        ...getCommonReducers(),
      };
  }
}

function getReviversForMode(mode: SerializationMode): Partial<Revivers> {
  switch (mode) {
    case 'workflow':
      return {
        ...getClassRevivers(),
        ...getStepFunctionReviver(),
        ...getCommonRevivers(),
      };
    case 'step':
      return {
        ...getClassRevivers(),
        ...getCommonRevivers(),
      };
    case 'client':
      return {
        ...getClassRevivers(),
        ...getCommonRevivers(),
        StepFunction: () => {
          throw new Error(
            'Step functions cannot be deserialized in client context.'
          );
        },
      };
  }
}

// ---- Codec implementation ----

export const devalueCodec: Codec = {
  formatPrefix: SerializationFormat.DEVALUE_V1,

  serialize(value: unknown, mode: SerializationMode): Uint8Array {
    const reducers = getReducersForMode(mode);
    const str = stringify(
      value,
      reducers as Record<string, (value: any) => any>
    );
    return encoder.encode(str);
  },

  deserialize(data: Uint8Array, mode: SerializationMode): unknown {
    const revivers = getReviversForMode(mode);
    const str = decoder.decode(data);
    return parse(str, revivers as Record<string, (value: any) => any>);
  },

  deserializeLegacy(data: unknown, mode: SerializationMode): unknown {
    const revivers = getReviversForMode(mode);
    return unflatten(
      data as any[],
      revivers as Record<string, (value: any) => any>
    );
  },
};
