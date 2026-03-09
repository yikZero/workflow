/**
 * VM-compatible common reducers and revivers.
 *
 * Identical to common.ts but without Node.js dependencies:
 * - Uses pure-JS base64 instead of Buffer
 * - Uses `instanceof Error` instead of `types.isNativeError()`
 *
 * This module is safe to bundle into the QuickJS WASM VM.
 */

import { base64Decode, base64Encode } from '../base64.js';
import type { Reducers, Revivers } from '../types.js';

// ---- Base64 helpers ----

function arrayBufferToBase64(
  value: ArrayBufferLike,
  offset: number,
  length: number
): string {
  if (length === 0) return '.';
  const uint8 = new Uint8Array(value, offset, length);
  return base64Encode(uint8);
}

function viewToBase64(value: ArrayBufferView): string {
  return arrayBufferToBase64(value.buffer, value.byteOffset, value.byteLength);
}

function reviveArrayBuffer(value: string): ArrayBuffer {
  const base64 = value === '.' ? '' : value;
  const bytes = base64Decode(base64);
  return bytes.buffer as ArrayBuffer;
}

// ---- Reducers ----

export function getCommonReducers(): Partial<Reducers> {
  return {
    ArrayBuffer: (value) =>
      value instanceof ArrayBuffer &&
      arrayBufferToBase64(value, 0, value.byteLength),
    BigInt: (value) => typeof value === 'bigint' && value.toString(),
    BigInt64Array: (value) =>
      value instanceof BigInt64Array && viewToBase64(value),
    BigUint64Array: (value) =>
      value instanceof BigUint64Array && viewToBase64(value),
    Date: (value) => {
      if (!(value instanceof Date)) return false;
      const valid = !Number.isNaN(value.getDate());
      return valid ? value.toISOString() : '.';
    },
    Error: (value) => {
      // In the VM, use instanceof Error (no node:util available)
      if (!(value instanceof Error)) return false;
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    },
    Float32Array: (value) =>
      value instanceof Float32Array && viewToBase64(value),
    Float64Array: (value) =>
      value instanceof Float64Array && viewToBase64(value),
    Int8Array: (value) => value instanceof Int8Array && viewToBase64(value),
    Int16Array: (value) => value instanceof Int16Array && viewToBase64(value),
    Int32Array: (value) => value instanceof Int32Array && viewToBase64(value),
    Map: (value) => value instanceof Map && Array.from(value),
    RegExp: (value) =>
      value instanceof RegExp && {
        source: value.source,
        flags: value.flags,
      },
    // Request/Response are not available in the VM — omitted
    Set: (value) => value instanceof Set && Array.from(value),
    URL: (value) => {
      // URL may not be available in QuickJS — check typeof
      if (typeof URL !== 'undefined' && value instanceof URL) return value.href;
      return false;
    },
    URLSearchParams: (value) => {
      if (
        typeof URLSearchParams !== 'undefined' &&
        value instanceof URLSearchParams
      ) {
        if (value.size === 0) return '.';
        return String(value);
      }
      return false;
    },
    Uint8Array: (value) => value instanceof Uint8Array && viewToBase64(value),
    Uint8ClampedArray: (value) =>
      value instanceof Uint8ClampedArray && viewToBase64(value),
    Uint16Array: (value) => value instanceof Uint16Array && viewToBase64(value),
    Uint32Array: (value) => value instanceof Uint32Array && viewToBase64(value),
  };
}

// ---- Revivers ----

export function getCommonRevivers(): Partial<Revivers> {
  return {
    ArrayBuffer: (value: string) => reviveArrayBuffer(value),
    BigInt: (value: string) => BigInt(value),
    BigInt64Array: (value: string) =>
      new BigInt64Array(reviveArrayBuffer(value)),
    BigUint64Array: (value: string) =>
      new BigUint64Array(reviveArrayBuffer(value)),
    Date: (value) => new Date(value),
    Error: (value) => {
      const error = new Error(value.message);
      error.name = value.name;
      error.stack = value.stack;
      return error;
    },
    Float32Array: (value: string) => new Float32Array(reviveArrayBuffer(value)),
    Float64Array: (value: string) => new Float64Array(reviveArrayBuffer(value)),
    Int8Array: (value: string) => new Int8Array(reviveArrayBuffer(value)),
    Int16Array: (value: string) => new Int16Array(reviveArrayBuffer(value)),
    Int32Array: (value: string) => new Int32Array(reviveArrayBuffer(value)),
    Map: (value) => new Map(value),
    RegExp: (value) => new RegExp(value.source, value.flags),
    Set: (value) => new Set(value),
    URL: (value) => {
      if (typeof URL !== 'undefined') return new URL(value);
      return value;
    },
    URLSearchParams: (value) => {
      if (typeof URLSearchParams !== 'undefined')
        return new URLSearchParams(value === '.' ? '' : value);
      return value;
    },
    Uint8Array: (value: string) => new Uint8Array(reviveArrayBuffer(value)),
    Uint8ClampedArray: (value: string) =>
      new Uint8ClampedArray(reviveArrayBuffer(value)),
    Uint16Array: (value: string) => new Uint16Array(reviveArrayBuffer(value)),
    Uint32Array: (value: string) => new Uint32Array(reviveArrayBuffer(value)),
    // Web API types — revived as plain objects in the VM since the real
    // constructors (Headers, Request, Response) are not available in QuickJS.
    // The workflow code can access the properties but not call Web API methods.
    Headers: (value) => {
      return new (globalThis as any).Headers(value);
    },
    Request: (value) => {
      Object.setPrototypeOf(value, (globalThis as any).Request.prototype);
      return value;
    },
    Response: (value: any) => {
      Object.setPrototypeOf(value, (globalThis as any).Response.prototype);
      value._body = value.body;
      value.ok = value.status >= 200 && value.status < 300;
      value.bodyUsed = false;
      return value;
    },
    ReadableStream: (value) => {
      // If this is a bodyInit (from Response/Request constructor),
      // create a ReadableStream-like object that stores the body data
      // so Response.json()/text() can read it.
      if (value && 'bodyInit' in value) {
        const stream = Object.create(
          (globalThis as any).ReadableStream.prototype
        );
        stream.__bodyData = value.bodyInit;
        return stream;
      }
      // Regular stream — return as opaque reference
      return Object.create((globalThis as any).ReadableStream.prototype);
    },
    WritableStream: (_value) => {
      return Object.create((globalThis as any).WritableStream.prototype);
    },
  };
}
