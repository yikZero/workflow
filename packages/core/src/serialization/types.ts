/**
 * Shared types for the serialization system.
 */

/**
 * Known serialization format identifiers.
 * Each format ID is exactly 4 ASCII characters, matching the convention
 * used for other workflow IDs (wrun, step, wait, etc.)
 */
export const SerializationFormat = {
  /** devalue stringify/parse with TextEncoder/TextDecoder */
  DEVALUE_V1: 'devl',
  /** Encrypted payload (inner payload has its own format prefix) */
  ENCRYPTED: 'encr',
  // Future formats (reserved):
  // JSON: 'json',  // JSON serialization (Python runtime compat)
  // CBOR: 'cbor',  // CBOR binary serialization
} as const;

export type SerializationFormatType =
  (typeof SerializationFormat)[keyof typeof SerializationFormat];

/**
 * Types that need specialized handling when serialized/deserialized.
 * If a type is added here, it MUST also be added to the `Serializable`
 * type in `schemas.ts`.
 */
export interface SerializableSpecial {
  ArrayBuffer: string; // base64 string
  BigInt: string; // string representation of bigint
  BigInt64Array: string; // base64 string
  BigUint64Array: string; // base64 string
  Date: string; // ISO string
  Float32Array: string; // base64 string
  Float64Array: string; // base64 string
  Error: Record<string, any>;
  Headers: [string, string][];
  Int8Array: string; // base64 string
  Int16Array: string; // base64 string
  Int32Array: string; // base64 string
  Map: [any, any][];
  ReadableStream:
    | { name: string; type?: 'bytes'; startIndex?: number }
    | { bodyInit: any };
  RegExp: { source: string; flags: string };
  Request: {
    method: string;
    url: string;
    headers: Headers;
    body: Request['body'];
    duplex: Request['duplex'];
    responseWritable?: WritableStream<Response>;
  };
  Response: {
    type: Response['type'];
    url: string;
    status: number;
    statusText: string;
    headers: Headers;
    body: Response['body'];
    redirected: boolean;
  };
  Class: {
    classId: string;
  };
  Instance: {
    classId: string;
    data: unknown;
  };
  Set: any[];
  StepFunction: {
    stepId: string;
    closureVars?: Record<string, any>;
  };
  URL: string;
  URLSearchParams: string;
  Uint8Array: string; // base64 string
  Uint8ClampedArray: string; // base64 string
  Uint16Array: string; // base64 string
  Uint32Array: string; // base64 string
  WritableStream: { name: string };
}

export type Reducers = {
  [K in keyof SerializableSpecial]: (
    value: any
  ) => SerializableSpecial[K] | false;
};

export type Revivers = {
  [K in keyof SerializableSpecial]: (value: SerializableSpecial[K]) => any;
};
