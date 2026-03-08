/**
 * Installs TextEncoder/TextDecoder polyfills on globalThis if not present.
 * This file is injected via esbuild's `inject` option to ensure the
 * polyfills are available before any other code runs.
 */

import { TextEncoder } from './text-encoder.js';
import { TextDecoder } from './text-decoder.js';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = TextDecoder;
}
