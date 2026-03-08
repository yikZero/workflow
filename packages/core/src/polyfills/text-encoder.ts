/**
 * Pure JavaScript TextEncoder polyfill for UTF-8 encoding.
 *
 * Adapted from nx.js (https://github.com/nicolo-ribaudo/nicolo-ribaudo)
 * Originally based on fast-text-encoding by Sam Thorogood.
 *
 * @copyright Apache License 2.0
 */

export class TextEncoder {
  readonly encoding = 'utf-8';

  encode(input?: string): Uint8Array {
    if (!input) return new Uint8Array(0);
    let pos = 0;
    const len = input.length;

    let at = 0;
    let tlen = Math.max(32, len + (len >>> 1) + 7);
    let target = new Uint8Array((tlen >>> 3) << 3);

    while (pos < len) {
      let value = input.charCodeAt(pos++);
      if (value >= 0xd800 && value <= 0xdbff) {
        if (pos < len) {
          const extra = input.charCodeAt(pos);
          if ((extra & 0xfc00) === 0xdc00) {
            ++pos;
            value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
          } else {
            value = 0xfffd;
          }
        } else {
          value = 0xfffd;
        }
      } else if (value >= 0xdc00 && value <= 0xdfff) {
        value = 0xfffd;
      }

      if ((value & 0xffffff80) === 0) {
        target[at++] = value;
        continue;
      } else if ((value & 0xfffff800) === 0) {
        target[at++] = ((value >>> 6) & 0x1f) | 0xc0;
      } else if ((value & 0xffff0000) === 0) {
        target[at++] = ((value >>> 12) & 0x0f) | 0xe0;
        target[at++] = ((value >>> 6) & 0x3f) | 0x80;
      } else if ((value & 0xffe00000) === 0) {
        target[at++] = ((value >>> 18) & 0x07) | 0xf0;
        target[at++] = ((value >>> 12) & 0x3f) | 0x80;
        target[at++] = ((value >>> 6) & 0x3f) | 0x80;
      } else {
        continue;
      }

      target[at++] = (value & 0x3f) | 0x80;
    }

    return target.slice(0, at);
  }

  encodeInto(
    _input: string,
    _destination: Uint8Array
  ): { read: number; written: number } {
    throw new Error('encodeInto not implemented');
  }
}
