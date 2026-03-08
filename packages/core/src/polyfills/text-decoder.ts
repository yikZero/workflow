/**
 * Pure JavaScript TextDecoder polyfill for UTF-8 decoding.
 *
 * Adapted from nx.js (https://github.com/TooTallNate/nx.js)
 * Originally based on fast-text-encoding by Sam Thorogood.
 *
 * @copyright Apache License 2.0
 * @author Sam Thorogood
 * @see https://github.com/samthor/fast-text-encoding/blob/master/src/lowlevel.js
 */

export class TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(
    encoding?: string,
    options?: { fatal?: boolean; ignoreBOM?: boolean }
  ) {
    if (
      typeof encoding === 'string' &&
      encoding !== 'utf-8' &&
      encoding !== 'utf8'
    ) {
      throw new TypeError('Only "utf-8" decoding is supported');
    }
    this.fatal = options?.fatal ?? false;
    this.ignoreBOM = options?.ignoreBOM ?? false;
  }

  decode(
    input?: ArrayBuffer | ArrayBufferView,
    _options?: { stream?: boolean }
  ): string {
    if (!input) return '';
    let bytes: Uint8Array;
    if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    let inputIndex = 0;

    const pendingSize = Math.min(256 * 256, bytes.length + 1);
    const pending = new Uint16Array(pendingSize);
    const chunks: string[] = [];
    let pendingIndex = 0;
    let isFirstChunk = true;

    for (;;) {
      const more = inputIndex < bytes.length;

      if (!more || pendingIndex >= pendingSize - 1) {
        const subarray = pending.subarray(0, pendingIndex);
        // @ts-expect-error — fromCharCode.apply accepts ArrayLike
        let chunk: string = String.fromCharCode.apply(null, subarray);

        if (
          isFirstChunk &&
          !this.ignoreBOM &&
          chunk.length > 0 &&
          chunk.charCodeAt(0) === 0xfeff
        ) {
          chunk = chunk.slice(1);
        }
        isFirstChunk = false;

        chunks.push(chunk);

        if (!more) {
          return chunks.join('');
        }

        bytes = bytes.subarray(inputIndex);
        inputIndex = 0;
        pendingIndex = 0;
      }

      const byte1 = bytes[inputIndex++];
      if ((byte1 & 0x80) === 0) {
        pending[pendingIndex++] = byte1;
      } else if ((byte1 & 0xe0) === 0xc0) {
        const byte2 = bytes[inputIndex++];
        if (byte2 === undefined || (byte2 & 0xc0) !== 0x80) {
          if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
          pending[pendingIndex++] = 0xfffd;
          if (byte2 !== undefined) inputIndex--;
        } else {
          pending[pendingIndex++] = ((byte1 & 0x1f) << 6) | (byte2 & 0x3f);
        }
      } else if ((byte1 & 0xf0) === 0xe0) {
        const byte2 = bytes[inputIndex++];
        if (byte2 === undefined || (byte2 & 0xc0) !== 0x80) {
          if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
          pending[pendingIndex++] = 0xfffd;
          if (byte2 !== undefined) inputIndex--;
        } else {
          const byte3 = bytes[inputIndex++];
          if (byte3 === undefined || (byte3 & 0xc0) !== 0x80) {
            if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
            pending[pendingIndex++] = 0xfffd;
            if (byte3 !== undefined) inputIndex--;
          } else {
            pending[pendingIndex++] =
              ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
          }
        }
      } else if ((byte1 & 0xf8) === 0xf0) {
        const byte2 = bytes[inputIndex++];
        if (byte2 === undefined || (byte2 & 0xc0) !== 0x80) {
          if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
          pending[pendingIndex++] = 0xfffd;
          if (byte2 !== undefined) inputIndex--;
        } else {
          const byte3 = bytes[inputIndex++];
          if (byte3 === undefined || (byte3 & 0xc0) !== 0x80) {
            if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
            pending[pendingIndex++] = 0xfffd;
            if (byte3 !== undefined) inputIndex--;
          } else {
            const byte4 = bytes[inputIndex++];
            if (byte4 === undefined || (byte4 & 0xc0) !== 0x80) {
              if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
              pending[pendingIndex++] = 0xfffd;
              if (byte4 !== undefined) inputIndex--;
            } else {
              let codepoint =
                ((byte1 & 0x07) << 0x12) |
                ((byte2 & 0x3f) << 0x0c) |
                ((byte3 & 0x3f) << 0x06) |
                (byte4 & 0x3f);
              if (codepoint > 0xffff) {
                codepoint -= 0x10000;
                pending[pendingIndex++] = ((codepoint >>> 10) & 0x3ff) | 0xd800;
                codepoint = 0xdc00 | (codepoint & 0x3ff);
              }
              pending[pendingIndex++] = codepoint;
            }
          }
        }
      } else {
        if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
        pending[pendingIndex++] = 0xfffd;
      }
    }
  }
}
