/**
 * Entry point for the VM serialization bundle.
 *
 * This file is bundled by esbuild into a self-contained IIFE that
 * sets up serialize/deserialize on globalThis. The bundled output
 * is evaluated inside the QuickJS VM during bootstrap.
 *
 * TextEncoder, TextDecoder, and Headers are provided by native C
 * extensions in quickjs-wasi, so no polyfills are needed.
 */

import { monotonicFactory } from 'ulid';
import { deserialize, serialize } from './workflow-vm.js';

// Install on global scope
(globalThis as any)[Symbol.for('workflow-serialize')] = serialize;
(globalThis as any)[Symbol.for('workflow-deserialize')] = deserialize;
(globalThis as any).__wdk_serialize = serialize;
(globalThis as any).__wdk_deserialize = deserialize;

// ULID generator for correlationIds — uses the same monotonicFactory as
// the event-replay runtime. The seeded PRNG is injected via __ulidPrng
// before the bootstrap runs; falls back to Math.random if not set.
//
// The timestamp argument is read from `globalThis.__ulidTimestamp` so the
// host can inject a deterministic timestamp that's stable across
// concurrent workflow invocations of the same resumption (otherwise
// `Date.now()` would diverge between concurrent VMs even when the seeded
// PRNG produces an identical random sequence). When unset, falls back to
// `Date.now()` so non-snapshot consumers of this bundle (e.g. tests)
// keep working.
const prng = (globalThis as any).__ulidPrng ?? Math.random;
const ulid = monotonicFactory(prng);
(globalThis as any).__generateUlid = () =>
  ulid((globalThis as any).__ulidTimestamp ?? Date.now());
