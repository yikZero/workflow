/**
 * Pure JavaScript base64 encode/decode.
 *
 * Used in place of Node.js Buffer for environments without it (QuickJS VM).
 * These functions work on Uint8Array inputs/outputs.
 */

const CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) {
  LOOKUP[CHARS.charCodeAt(i)] = i;
}

/**
 * Encode a Uint8Array to a base64 string.
 */
export function base64Encode(bytes: Uint8Array): string {
  const len = bytes.length;
  let result = '';

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += CHARS[(b0 >> 2) & 0x3f];
    result += CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < len ? CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : '=';
    result += i + 2 < len ? CHARS[b2 & 0x3f] : '=';
  }

  return result;
}

/**
 * Decode a base64 string to a Uint8Array.
 */
export function base64Decode(str: string): Uint8Array {
  // Remove padding
  let len = str.length;
  if (str[len - 1] === '=') len--;
  if (str[len - 1] === '=') len--;

  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = LOOKUP[str.charCodeAt(i)];
    const c1 = LOOKUP[str.charCodeAt(i + 1)];
    const c2 = i + 2 < len ? LOOKUP[str.charCodeAt(i + 2)] : 0;
    const c3 = i + 3 < len ? LOOKUP[str.charCodeAt(i + 3)] : 0;

    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < len) bytes[p++] = ((c1 << 4) | (c2 >> 2)) & 0xff;
    if (i + 3 < len) bytes[p++] = ((c2 << 6) | c3) & 0xff;
  }

  return bytes;
}
