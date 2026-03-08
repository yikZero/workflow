/**
 * Serialization module — public API.
 *
 * Re-exports the mode-specific serialize/deserialize functions and
 * provides backwards-compatible aliases for the legacy function names.
 */

// Re-export types
export type {
  SerializationFormatType,
  SerializableSpecial,
  Reducers,
  Revivers,
} from './types.js';
export { SerializationFormat } from './types.js';

// Re-export format prefix utilities
export {
  encodeWithFormatPrefix,
  decodeFormatPrefix,
  peekFormatPrefix,
  isEncrypted,
} from './format.js';

// Re-export codec
export type { Codec } from './codec.js';
export { devalueCodec } from './codec-devalue.js';

// Re-export encryption
export {
  encrypt,
  decrypt,
  type CryptoKey,
  type EncryptionKeyParam,
} from './encryption.js';

// Re-export mode-specific modules as namespaces
import * as workflow from './workflow.js';
import * as step from './step.js';
import * as client from './client.js';
export { workflow, step, client };

// Re-export reducers for direct composition (used by stream framing, etc.)
export {
  getCommonReducers,
  getCommonRevivers,
  revive,
} from './reducers/common.js';
export { getClassReducers, getClassRevivers } from './reducers/class.js';
export {
  getStepFunctionReducer,
  getStepFunctionReviver,
} from './reducers/step-function.js';
