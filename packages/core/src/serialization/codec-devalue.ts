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
// Note: Reducers and revivers are currently called without a `global`
// parameter, defaulting to `globalThis`. This means the modular mode
// modules (workflow.ts, step.ts, client.ts) work correctly when
// `globalThis` IS the VM's global (which is the case inside a Node.js
// `vm.Context` sandbox), but cannot be used for cross-VM serialization
// where the caller passes a different `global` object.
//
// The legacy dehydrate/hydrate functions in serialization.ts still
// support passing a custom `global` for full cross-VM compatibility.
// Adding `global` parameter threading to the Codec interface is
// deferred until the snapshot runtime work requires it.

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
