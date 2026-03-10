/**
 * Entry point for the VM serialization bundle.
 *
 * This file is bundled by esbuild into a self-contained IIFE that
 * sets up serialize/deserialize on globalThis. The bundled output
 * is evaluated inside the QuickJS VM during bootstrap.
 *
 * It includes the TextEncoder/TextDecoder polyfills since QuickJS
 * doesn't have them natively.
 */

import { TextDecoder as TextDecoderPolyfill } from '../polyfills/text-decoder.js';
// Polyfills MUST be installed before any other imports, because
// the devalue codec uses `new TextEncoder()` at module scope.
import { TextEncoder as TextEncoderPolyfill } from '../polyfills/text-encoder.js';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoderPolyfill;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = TextDecoderPolyfill;
}

import { monotonicFactory } from 'ulid';
// Now it's safe to import the serializer (uses TextEncoder/TextDecoder)
import { deserialize, serialize } from './workflow-vm.js';

// Install on global scope
(globalThis as any)[Symbol.for('workflow-serialize')] = serialize;
(globalThis as any)[Symbol.for('workflow-deserialize')] = deserialize;
(globalThis as any).__wdk_serialize = serialize;
(globalThis as any).__wdk_deserialize = deserialize;

// ULID generator for correlationIds — uses the same monotonicFactory as the
// event-replay runtime. The seeded PRNG is injected via __ulidPrng before
// the bootstrap runs; falls back to Math.random if not set.
const prng = (globalThis as any).__ulidPrng ?? Math.random;
const ulid = monotonicFactory(prng);
(globalThis as any).__generateUlid = () => ulid(Date.now());
