'use strict';
(() => {
  var Oe = Object.defineProperty;
  var Ue = (e, r, t) =>
    r in e
      ? Oe(e, r, { enumerable: !0, configurable: !0, writable: !0, value: t })
      : (e[r] = t);
  var _ = (e, r, t) => Ue(e, typeof r != 'symbol' ? r + '' : r, t);
  var T = class {
    constructor() {
      _(this, 'encoding', 'utf-8');
    }
    encode(r) {
      if (!r) return new Uint8Array(0);
      let t = 0,
        n = r.length,
        o = 0,
        c = Math.max(32, n + (n >>> 1) + 7),
        s = new Uint8Array((c >>> 3) << 3);
      for (; t < n; ) {
        let l = r.charCodeAt(t++);
        if (l >= 55296 && l <= 56319)
          if (t < n) {
            let i = r.charCodeAt(t);
            (i & 64512) === 56320
              ? (++t, (l = ((l & 1023) << 10) + (i & 1023) + 65536))
              : (l = 65533);
          } else l = 65533;
        else l >= 56320 && l <= 57343 && (l = 65533);
        if ((l & 4294967168) === 0) {
          s[o++] = l;
          continue;
        } else if ((l & 4294965248) === 0) s[o++] = ((l >>> 6) & 31) | 192;
        else if ((l & 4294901760) === 0)
          (s[o++] = ((l >>> 12) & 15) | 224), (s[o++] = ((l >>> 6) & 63) | 128);
        else if ((l & 4292870144) === 0)
          (s[o++] = ((l >>> 18) & 7) | 240),
            (s[o++] = ((l >>> 12) & 63) | 128),
            (s[o++] = ((l >>> 6) & 63) | 128);
        else continue;
        s[o++] = (l & 63) | 128;
      }
      return s.slice(0, o);
    }
    encodeInto(r, t) {
      throw new Error('encodeInto not implemented');
    }
  };
  var O = class {
    constructor(r, t) {
      _(this, 'encoding', 'utf-8');
      _(this, 'fatal');
      _(this, 'ignoreBOM');
      if (typeof r == 'string' && r !== 'utf-8' && r !== 'utf8')
        throw new TypeError('Only "utf-8" decoding is supported');
      (this.fatal = t?.fatal ?? !1), (this.ignoreBOM = t?.ignoreBOM ?? !1);
    }
    decode(r, t) {
      if (!r) return '';
      let n;
      r instanceof ArrayBuffer
        ? (n = new Uint8Array(r))
        : (n = new Uint8Array(r.buffer, r.byteOffset, r.byteLength));
      let o = 0,
        c = Math.min(256 * 256, n.length + 1),
        s = new Uint16Array(c),
        l = [],
        i = 0,
        a = !0;
      for (;;) {
        let d = o < n.length;
        if (!d || i >= c - 1) {
          let y = s.subarray(0, i),
            g = String.fromCharCode.apply(null, y);
          if (
            (a &&
              !this.ignoreBOM &&
              g.length > 0 &&
              g.charCodeAt(0) === 65279 &&
              (g = g.slice(1)),
            (a = !1),
            l.push(g),
            !d)
          )
            return l.join('');
          (n = n.subarray(o)), (o = 0), (i = 0);
        }
        let f = n[o++];
        if ((f & 128) === 0) s[i++] = f;
        else if ((f & 224) === 192) {
          let y = n[o++];
          if (y === void 0 || (y & 192) !== 128) {
            if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
            (s[i++] = 65533), y !== void 0 && o--;
          } else s[i++] = ((f & 31) << 6) | (y & 63);
        } else if ((f & 240) === 224) {
          let y = n[o++];
          if (y === void 0 || (y & 192) !== 128) {
            if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
            (s[i++] = 65533), y !== void 0 && o--;
          } else {
            let g = n[o++];
            if (g === void 0 || (g & 192) !== 128) {
              if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
              (s[i++] = 65533), g !== void 0 && o--;
            } else s[i++] = ((f & 15) << 12) | ((y & 63) << 6) | (g & 63);
          }
        } else if ((f & 248) === 240) {
          let y = n[o++];
          if (y === void 0 || (y & 192) !== 128) {
            if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
            (s[i++] = 65533), y !== void 0 && o--;
          } else {
            let g = n[o++];
            if (g === void 0 || (g & 192) !== 128) {
              if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
              (s[i++] = 65533), g !== void 0 && o--;
            } else {
              let u = n[o++];
              if (u === void 0 || (u & 192) !== 128) {
                if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
                (s[i++] = 65533), u !== void 0 && o--;
              } else {
                let b =
                  ((f & 7) << 18) |
                  ((y & 63) << 12) |
                  ((g & 63) << 6) |
                  (u & 63);
                b > 65535 &&
                  ((b -= 65536),
                  (s[i++] = ((b >>> 10) & 1023) | 55296),
                  (b = 56320 | (b & 1023))),
                  (s[i++] = b);
              }
            }
          }
        } else {
          if (this.fatal) throw new TypeError('Invalid UTF-8 sequence');
          s[i++] = 65533;
        }
      }
    }
  };
  function x(e) {
    let r = typeof e == 'string' ? e : String(e);
    if (/[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(r) || r === '')
      throw new TypeError(`Invalid character in header field name: "${r}"`);
    return r.toLowerCase();
  }
  function k(e) {
    return (typeof e == 'string' ? e : String(e)).replace(
      /^[\t ]+|[\t ]+$/g,
      ''
    );
  }
  var se = (e) => e.join(', '),
    F = class e {
      constructor(r) {
        _(this, '_map', new Map());
        let t = this._map;
        if (r instanceof e) for (let [n, o] of r._map) t.set(n, [...o]);
        else if (Array.isArray(r))
          for (let n = 0; n < r.length; n++) {
            let o = r[n],
              c = x(o[0]),
              s = k(o[1]),
              l = t.get(c);
            l ? l.push(s) : t.set(c, [s]);
          }
        else if (r)
          for (let n of Object.getOwnPropertyNames(r)) t.set(x(n), [k(r[n])]);
      }
      append(r, t) {
        (r = x(r)), (t = k(t));
        let n = this._map,
          o = n.get(r);
        o || ((o = []), n.set(r, o)), o.push(t);
      }
      delete(r) {
        this._map.delete(x(r));
      }
      get(r) {
        let t = this._map.get(x(r));
        return t ? se(t) : null;
      }
      getSetCookie() {
        return [...(this._map.get('set-cookie') || [])];
      }
      has(r) {
        return this._map.has(x(r));
      }
      set(r, t) {
        this._map.set(x(r), [k(t)]);
      }
      forEach(r, t) {
        for (let [n, o] of this.entries()) r.call(t, o, n, this);
      }
      *entries() {
        let r = [...this._map.entries()].sort((t, n) =>
          t[0] < n[0] ? -1 : t[0] > n[0] ? 1 : 0
        );
        for (let [t, n] of r)
          if (t === 'set-cookie') for (let o of n) yield [t, o];
          else yield [t, se(n)];
      }
      *keys() {
        for (let [r] of this.entries()) yield r;
      }
      *values() {
        for (let [, r] of this.entries()) yield r;
      }
      [Symbol.iterator]() {
        return this.entries();
      }
    };
  typeof globalThis.TextEncoder > 'u' && (globalThis.TextEncoder = T);
  typeof globalThis.TextDecoder > 'u' && (globalThis.TextDecoder = O);
  typeof globalThis.Headers > 'u' && (globalThis.Headers = F);
  var C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var w;
  (function (e) {
    (e.Base32IncorrectEncoding = 'B32_ENC_INVALID'),
      (e.DecodeTimeInvalidCharacter = 'DEC_TIME_CHAR'),
      (e.DecodeTimeValueMalformed = 'DEC_TIME_MALFORMED'),
      (e.EncodeTimeNegative = 'ENC_TIME_NEG'),
      (e.EncodeTimeSizeExceeded = 'ENC_TIME_SIZE_EXCEED'),
      (e.EncodeTimeValueMalformed = 'ENC_TIME_MALFORMED'),
      (e.PRNGDetectFailure = 'PRNG_DETECT'),
      (e.ULIDInvalid = 'ULID_INVALID'),
      (e.Unexpected = 'UNEXPECTED'),
      (e.UUIDInvalid = 'UUID_INVALID');
  })(w || (w = {}));
  var I = class extends Error {
    constructor(r, t) {
      super(`${t} (${r})`), (this.name = 'ULIDError'), (this.code = r);
    }
  };
  function Ne(e) {
    let r = Math.floor(e() * 32) % 32;
    return C.charAt(r);
  }
  function ae(e, r, t) {
    return r > e.length - 1 ? e : e.substr(0, r) + t + e.substr(r + 1);
  }
  function Ce(e) {
    let r,
      t = e.length,
      n,
      o,
      c = e,
      s = 31;
    for (; !r && t-- >= 0; ) {
      if (((n = c[t]), (o = C.indexOf(n)), o === -1))
        throw new I(w.Base32IncorrectEncoding, 'Incorrectly encoded string');
      if (o === s) {
        c = ae(c, t, C[0]);
        continue;
      }
      r = ae(c, t, C[o + 1]);
    }
    if (typeof r == 'string') return r;
    throw new I(w.Base32IncorrectEncoding, 'Failed incrementing string');
  }
  function Le(e) {
    let r = De(),
      t = (r && (r.crypto || r.msCrypto)) || null;
    if (typeof t?.getRandomValues == 'function')
      return () => {
        let n = new Uint8Array(1);
        return t.getRandomValues(n), n[0] / 255;
      };
    if (typeof t?.randomBytes == 'function')
      return () => t.randomBytes(1).readUInt8() / 255;
    throw new I(w.PRNGDetectFailure, 'Failed to find a reliable PRNG');
  }
  function De() {
    return ke()
      ? self
      : typeof window < 'u'
        ? window
        : typeof global < 'u'
          ? global
          : typeof globalThis < 'u'
            ? globalThis
            : null;
  }
  function Me(e, r) {
    let t = '';
    for (; e > 0; e--) t = Ne(r) + t;
    return t;
  }
  function ie(e, r = 10) {
    if (isNaN(e))
      throw new I(w.EncodeTimeValueMalformed, `Time must be a number: ${e}`);
    if (e > 0xffffffffffff)
      throw new I(
        w.EncodeTimeSizeExceeded,
        `Cannot encode a time larger than ${0xffffffffffff}: ${e}`
      );
    if (e < 0) throw new I(w.EncodeTimeNegative, `Time must be positive: ${e}`);
    if (Number.isInteger(e) === !1)
      throw new I(w.EncodeTimeValueMalformed, `Time must be an integer: ${e}`);
    let t,
      n = '';
    for (let o = r; o > 0; o--)
      (t = e % 32), (n = C.charAt(t) + n), (e = (e - t) / 32);
    return n;
  }
  function ke() {
    return typeof WorkerGlobalScope < 'u' && self instanceof WorkerGlobalScope;
  }
  function fe(e) {
    let r = e || Le(),
      t = 0,
      n;
    return function (c) {
      let s = !c || isNaN(c) ? Date.now() : c;
      if (s <= t) {
        let i = (n = Ce(n));
        return ie(t, 10) + i;
      }
      t = s;
      let l = (n = Me(16, r));
      return ie(s, 10) + l;
    };
  }
  var S = class extends Error {
    constructor(r, t, n, o) {
      super(r),
        (this.name = 'DevalueError'),
        (this.path = t.join('')),
        (this.value = n),
        (this.root = o);
    }
  };
  function Z(e) {
    return Object(e) !== e;
  }
  var Fe = Object.getOwnPropertyNames(Object.prototype).sort().join('\0');
  function ce(e) {
    let r = Object.getPrototypeOf(e);
    return (
      r === Object.prototype ||
      r === null ||
      Object.getPrototypeOf(r) === null ||
      Object.getOwnPropertyNames(r).sort().join('\0') === Fe
    );
  }
  function le(e) {
    return Object.prototype.toString.call(e).slice(8, -1);
  }
  function Pe(e) {
    switch (e) {
      case '"':
        return '\\"';
      case '<':
        return '\\u003C';
      case '\\':
        return '\\\\';
      case `
`:
        return '\\n';
      case '\r':
        return '\\r';
      case '	':
        return '\\t';
      case '\b':
        return '\\b';
      case '\f':
        return '\\f';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return e < ' '
          ? `\\u${e.charCodeAt(0).toString(16).padStart(4, '0')}`
          : '';
    }
  }
  function h(e) {
    let r = '',
      t = 0,
      n = e.length;
    for (let o = 0; o < n; o += 1) {
      let c = e[o],
        s = Pe(c);
      s && ((r += e.slice(t, o) + s), (t = o + 1));
    }
    return `"${t === 0 ? e : r + e.slice(t)}"`;
  }
  function ue(e) {
    return Object.getOwnPropertySymbols(e).filter(
      (r) => Object.getOwnPropertyDescriptor(e, r).enumerable
    );
  }
  var Be = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
  function K(e) {
    return Be.test(e) ? '.' + e : '[' + JSON.stringify(e) + ']';
  }
  function We(e) {
    if (e.length === 0 || (e.length > 1 && e.charCodeAt(0) === 48)) return !1;
    for (let t = 0; t < e.length; t++) {
      let n = e.charCodeAt(t);
      if (n < 48 || n > 57) return !1;
    }
    let r = +e;
    return !(r >= 2 ** 32 - 1 || r < 0);
  }
  function ye(e) {
    let r = Object.keys(e);
    for (var t = r.length - 1; t >= 0 && !We(r[t]); t--);
    return (r.length = t + 1), r;
  }
  function de(e) {
    let r = new DataView(e),
      t = '';
    for (let n = 0; n < e.byteLength; n++)
      t += String.fromCharCode(r.getUint8(n));
    return je(t);
  }
  function pe(e) {
    let r = $e(e),
      t = new ArrayBuffer(r.length),
      n = new DataView(t);
    for (let o = 0; o < t.byteLength; o++) n.setUint8(o, r.charCodeAt(o));
    return t;
  }
  var ge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function $e(e) {
    e.length % 4 === 0 && (e = e.replace(/==?$/, ''));
    let r = '',
      t = 0,
      n = 0;
    for (let o = 0; o < e.length; o++)
      (t <<= 6),
        (t |= ge.indexOf(e[o])),
        (n += 6),
        n === 24 &&
          ((r += String.fromCharCode((t & 16711680) >> 16)),
          (r += String.fromCharCode((t & 65280) >> 8)),
          (r += String.fromCharCode(t & 255)),
          (t = n = 0));
    return (
      n === 12
        ? ((t >>= 4), (r += String.fromCharCode(t)))
        : n === 18 &&
          ((t >>= 2),
          (r += String.fromCharCode((t & 65280) >> 8)),
          (r += String.fromCharCode(t & 255))),
      r
    );
  }
  function je(e) {
    let r = '';
    for (let t = 0; t < e.length; t += 3) {
      let n = [void 0, void 0, void 0, void 0];
      (n[0] = e.charCodeAt(t) >> 2),
        (n[1] = (e.charCodeAt(t) & 3) << 4),
        e.length > t + 1 &&
          ((n[1] |= e.charCodeAt(t + 1) >> 4),
          (n[2] = (e.charCodeAt(t + 1) & 15) << 2)),
        e.length > t + 2 &&
          ((n[2] |= e.charCodeAt(t + 2) >> 6),
          (n[3] = e.charCodeAt(t + 2) & 63));
      for (let o = 0; o < n.length; o++)
        typeof n[o] > 'u' ? (r += '=') : (r += ge[n[o]]);
    }
    return r;
  }
  function H(e, r) {
    return P(JSON.parse(e), r);
  }
  function P(e, r) {
    if (typeof e == 'number') return c(e, !0);
    if (!Array.isArray(e) || e.length === 0) throw new Error('Invalid input');
    let t = e,
      n = Array(t.length),
      o = null;
    function c(s, l = !1) {
      if (s === -1) return;
      if (s === -3) return NaN;
      if (s === -4) return 1 / 0;
      if (s === -5) return -1 / 0;
      if (s === -6) return -0;
      if (l || typeof s != 'number') throw new Error('Invalid input');
      if (s in n) return n[s];
      let i = t[s];
      if (!i || typeof i != 'object') n[s] = i;
      else if (Array.isArray(i))
        if (typeof i[0] == 'string') {
          let a = i[0],
            d = r && Object.hasOwn(r, a) ? r[a] : void 0;
          if (d) {
            let f = i[1];
            if (
              (typeof f != 'number' && (f = t.push(i[1]) - 1),
              o ?? (o = new Set()),
              o.has(f))
            )
              throw new Error('Invalid circular reference');
            return o.add(f), (n[s] = d(c(f))), o.delete(f), n[s];
          }
          switch (a) {
            case 'Date':
              n[s] = new Date(i[1]);
              break;
            case 'Set':
              let f = new Set();
              n[s] = f;
              for (let u = 1; u < i.length; u += 1) f.add(c(i[u]));
              break;
            case 'Map':
              let y = new Map();
              n[s] = y;
              for (let u = 1; u < i.length; u += 2) y.set(c(i[u]), c(i[u + 1]));
              break;
            case 'RegExp':
              n[s] = new RegExp(i[1], i[2]);
              break;
            case 'Object':
              n[s] = Object(i[1]);
              break;
            case 'BigInt':
              n[s] = BigInt(i[1]);
              break;
            case 'null':
              let g = Object.create(null);
              n[s] = g;
              for (let u = 1; u < i.length; u += 2) g[i[u]] = c(i[u + 1]);
              break;
            case 'Int8Array':
            case 'Uint8Array':
            case 'Uint8ClampedArray':
            case 'Int16Array':
            case 'Uint16Array':
            case 'Int32Array':
            case 'Uint32Array':
            case 'Float32Array':
            case 'Float64Array':
            case 'BigInt64Array':
            case 'BigUint64Array': {
              if (t[i[1]][0] !== 'ArrayBuffer') throw new Error('Invalid data');
              let u = globalThis[a],
                b = c(i[1]),
                p = new u(b);
              n[s] = i[2] !== void 0 ? p.subarray(i[2], i[3]) : p;
              break;
            }
            case 'ArrayBuffer': {
              let u = i[1];
              if (typeof u != 'string')
                throw new Error('Invalid ArrayBuffer encoding');
              let b = pe(u);
              n[s] = b;
              break;
            }
            case 'Temporal.Duration':
            case 'Temporal.Instant':
            case 'Temporal.PlainDate':
            case 'Temporal.PlainTime':
            case 'Temporal.PlainDateTime':
            case 'Temporal.PlainMonthDay':
            case 'Temporal.PlainYearMonth':
            case 'Temporal.ZonedDateTime': {
              let u = a.slice(9);
              n[s] = Temporal[u].from(i[1]);
              break;
            }
            case 'URL': {
              let u = new URL(i[1]);
              n[s] = u;
              break;
            }
            case 'URLSearchParams': {
              let u = new URLSearchParams(i[1]);
              n[s] = u;
              break;
            }
            default:
              throw new Error(`Unknown type ${a}`);
          }
        } else if (i[0] === -7) {
          let a = i[1],
            d = new Array(a);
          n[s] = d;
          for (let f = 2; f < i.length; f += 2) {
            let y = i[f];
            d[y] = c(i[f + 1]);
          }
        } else {
          let a = new Array(i.length);
          n[s] = a;
          for (let d = 0; d < i.length; d += 1) {
            let f = i[d];
            f !== -2 && (a[d] = c(f));
          }
        }
      else {
        let a = {};
        n[s] = a;
        for (let d of Object.keys(i)) {
          if (d === '__proto__')
            throw new Error(
              'Cannot parse an object with a `__proto__` property'
            );
          let f = i[d];
          a[d] = c(f);
        }
      }
      return n[s];
    }
    return c(0);
  }
  function Y(e, r) {
    let t = [],
      n = new Map(),
      o = [];
    if (r)
      for (let a of Object.getOwnPropertyNames(r)) o.push({ key: a, fn: r[a] });
    let c = [],
      s = 0;
    function l(a) {
      if (a === void 0) return -1;
      if (Number.isNaN(a)) return -3;
      if (a === 1 / 0) return -4;
      if (a === -1 / 0) return -5;
      if (a === 0 && 1 / a < 0) return -6;
      if (n.has(a)) return n.get(a);
      let d = s++;
      n.set(a, d);
      for (let { key: y, fn: g } of o) {
        let u = g(a);
        if (u) return (t[d] = `["${y}",${l(u)}]`), d;
      }
      if (typeof a == 'function')
        throw new S('Cannot stringify a function', c, a, e);
      let f = '';
      if (Z(a)) f = G(a);
      else {
        let y = le(a);
        switch (y) {
          case 'Number':
          case 'String':
          case 'Boolean':
            f = `["Object",${G(a)}]`;
            break;
          case 'BigInt':
            f = `["BigInt",${a}]`;
            break;
          case 'Date':
            f = `["Date","${!isNaN(a.getDate()) ? a.toISOString() : ''}"]`;
            break;
          case 'URL':
            f = `["URL",${h(a.toString())}]`;
            break;
          case 'URLSearchParams':
            f = `["URLSearchParams",${h(a.toString())}]`;
            break;
          case 'RegExp':
            let { source: u, flags: b } = a;
            f = b ? `["RegExp",${h(u)},"${b}"]` : `["RegExp",${h(u)}]`;
            break;
          case 'Array': {
            let p = !1;
            f = '[';
            for (let m = 0; m < a.length; m += 1)
              if ((m > 0 && (f += ','), Object.hasOwn(a, m)))
                c.push(`[${m}]`), (f += l(a[m])), c.pop();
              else if (p) f += -2;
              else {
                let R = ye(a),
                  N = R.length,
                  oe = String(a.length).length,
                  Re = (a.length - N) * 3,
                  Te = 4 + oe + N * (oe + 1);
                if (Re > Te) {
                  f = '[' + -7 + ',' + a.length;
                  for (let z = 0; z < R.length; z++) {
                    let V = R[z];
                    c.push(`[${V}]`), (f += ',' + V + ',' + l(a[V])), c.pop();
                  }
                  break;
                } else (p = !0), (f += -2);
              }
            f += ']';
            break;
          }
          case 'Set':
            f = '["Set"';
            for (let p of a) f += `,${l(p)}`;
            f += ']';
            break;
          case 'Map':
            f = '["Map"';
            for (let [p, m] of a)
              c.push(`.get(${Z(p) ? G(p) : '...'})`),
                (f += `,${l(p)},${l(m)}`),
                c.pop();
            f += ']';
            break;
          case 'Int8Array':
          case 'Uint8Array':
          case 'Uint8ClampedArray':
          case 'Int16Array':
          case 'Uint16Array':
          case 'Int32Array':
          case 'Uint32Array':
          case 'Float32Array':
          case 'Float64Array':
          case 'BigInt64Array':
          case 'BigUint64Array': {
            let p = a;
            f = '["' + y + '",' + l(p.buffer);
            let m = a.byteOffset,
              R = m + a.byteLength;
            if (m > 0 || R !== p.buffer.byteLength) {
              let N = +/(\d+)/.exec(y)[1] / 8;
              f += `,${m / N},${R / N}`;
            }
            f += ']';
            break;
          }
          case 'ArrayBuffer': {
            f = `["ArrayBuffer","${de(a)}"]`;
            break;
          }
          case 'Temporal.Duration':
          case 'Temporal.Instant':
          case 'Temporal.PlainDate':
          case 'Temporal.PlainTime':
          case 'Temporal.PlainDateTime':
          case 'Temporal.PlainMonthDay':
          case 'Temporal.PlainYearMonth':
          case 'Temporal.ZonedDateTime':
            f = `["${y}",${h(a.toString())}]`;
            break;
          default:
            if (!ce(a))
              throw new S('Cannot stringify arbitrary non-POJOs', c, a, e);
            if (ue(a).length > 0)
              throw new S('Cannot stringify POJOs with symbolic keys', c, a, e);
            if (Object.getPrototypeOf(a) === null) {
              f = '["null"';
              for (let p of Object.keys(a)) {
                if (p === '__proto__')
                  throw new S(
                    'Cannot stringify objects with __proto__ keys',
                    c,
                    a,
                    e
                  );
                c.push(K(p)), (f += `,${h(p)},${l(a[p])}`), c.pop();
              }
              f += ']';
            } else {
              f = '{';
              let p = !1;
              for (let m of Object.keys(a)) {
                if (m === '__proto__')
                  throw new S(
                    'Cannot stringify objects with __proto__ keys',
                    c,
                    a,
                    e
                  );
                p && (f += ','),
                  (p = !0),
                  c.push(K(m)),
                  (f += `${h(m)}:${l(a[m])}`),
                  c.pop();
              }
              f += '}';
            }
        }
      }
      return (t[d] = f), d;
    }
    let i = l(e);
    return i < 0 ? `${i}` : `[${t.join(',')}]`;
  }
  function G(e) {
    let r = typeof e;
    return r === 'string'
      ? h(e)
      : e instanceof String
        ? h(e.toString())
        : e === void 0
          ? (-1).toString()
          : e === 0 && 1 / e < 0
            ? (-6).toString()
            : r === 'bigint'
              ? `["BigInt","${e}"]`
              : String(e);
  }
  function Ae(e) {
    return e.length === 4 && /^[a-z0-9]{4}$/.test(e);
  }
  var L = { DEVALUE_V1: 'devl', ENCRYPTED: 'encr' };
  var v = Symbol.for('workflow-serialize'),
    q = Symbol.for('workflow-deserialize');
  var X = Symbol.for('workflow-class-registry');
  function He(e = globalThis) {
    let r = e,
      t = r[X];
    return t || ((t = new Map()), (r[X] = t)), t;
  }
  function J(e, r) {
    return He(r).get(e);
  }
  function B() {
    return {
      Class: (e) => {
        if (typeof e != 'function') return !1;
        let r = e.classId;
        return typeof r != 'string' ? !1 : { classId: r };
      },
      Instance: (e) => {
        if (e === null || typeof e != 'object') return !1;
        let r = e.constructor;
        if (!r || typeof r != 'function') return !1;
        let t = r[v];
        if (typeof t != 'function') return !1;
        let n = r.classId;
        if (typeof n != 'string')
          throw new Error(
            `Class "${r.name}" with ${String(v)} must have a static "classId" property.`
          );
        let o = t.call(r, e);
        return { classId: n, data: o };
      },
    };
  }
  function W(e = globalThis) {
    return {
      Class: (r) => {
        let t = r.classId,
          n = J(t, e);
        if (!n)
          throw new Error(
            `Class "${t}" not found. Make sure the class is registered with registerSerializationClass.`
          );
        return n;
      },
      Instance: (r) => {
        let t = r.classId,
          n = r.data,
          o = J(t, e);
        if (!o)
          throw new Error(
            `Class "${t}" not found. Make sure the class is registered with registerSerializationClass.`
          );
        let c = o[q];
        if (typeof c != 'function')
          throw new Error(
            `Class "${t}" does not have a static ${String(q)} method.`
          );
        return c.call(o, n);
      },
    };
  }
  var U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    D = new Uint8Array(256);
  for (let e = 0; e < U.length; e++) D[U.charCodeAt(e)] = e;
  function he(e) {
    let r = e.length,
      t = '';
    for (let n = 0; n < r; n += 3) {
      let o = e[n],
        c = n + 1 < r ? e[n + 1] : 0,
        s = n + 2 < r ? e[n + 2] : 0;
      (t += U[(o >> 2) & 63]),
        (t += U[((o << 4) | (c >> 4)) & 63]),
        (t += n + 1 < r ? U[((c << 2) | (s >> 6)) & 63] : '='),
        (t += n + 2 < r ? U[s & 63] : '=');
    }
    return t;
  }
  function we(e) {
    let r = e.length;
    e[r - 1] === '=' && r--, e[r - 1] === '=' && r--;
    let t = new Uint8Array(Math.floor((r * 3) / 4)),
      n = 0;
    for (let o = 0; o < r; o += 4) {
      let c = D[e.charCodeAt(o)],
        s = D[e.charCodeAt(o + 1)],
        l = o + 2 < r ? D[e.charCodeAt(o + 2)] : 0,
        i = o + 3 < r ? D[e.charCodeAt(o + 3)] : 0;
      (t[n++] = (c << 2) | (s >> 4)),
        o + 2 < r && (t[n++] = ((s << 4) | (l >> 2)) & 255),
        o + 3 < r && (t[n++] = ((l << 6) | i) & 255);
    }
    return t;
  }
  function Ie(e, r, t) {
    if (t === 0) return '.';
    let n = new Uint8Array(e, r, t);
    return he(n);
  }
  function A(e) {
    return Ie(e.buffer, e.byteOffset, e.byteLength);
  }
  function E(e) {
    return we(e === '.' ? '' : e).buffer;
  }
  function $() {
    return {
      ArrayBuffer: (e) => e instanceof ArrayBuffer && Ie(e, 0, e.byteLength),
      BigInt: (e) => typeof e == 'bigint' && e.toString(),
      BigInt64Array: (e) => e instanceof BigInt64Array && A(e),
      BigUint64Array: (e) => e instanceof BigUint64Array && A(e),
      Date: (e) =>
        e instanceof Date
          ? !Number.isNaN(e.getDate())
            ? e.toISOString()
            : '.'
          : !1,
      Error: (e) =>
        e instanceof Error
          ? { name: e.name, message: e.message, stack: e.stack }
          : !1,
      Float32Array: (e) => e instanceof Float32Array && A(e),
      Float64Array: (e) => e instanceof Float64Array && A(e),
      Int8Array: (e) => e instanceof Int8Array && A(e),
      Int16Array: (e) => e instanceof Int16Array && A(e),
      Int32Array: (e) => e instanceof Int32Array && A(e),
      Map: (e) => e instanceof Map && Array.from(e),
      RegExp: (e) =>
        e instanceof RegExp && { source: e.source, flags: e.flags },
      Headers: (e) => {
        let r = globalThis.Headers;
        return !r || !(e instanceof r) ? !1 : Array.from(e);
      },
      Request: (e) => {
        let r = globalThis.Request;
        if (
          !r ||
          (!(e instanceof r) && typeof e?.json != 'function') ||
          typeof e?.method != 'string'
        )
          return !1;
        let t = {
            method: e.method,
            url: e.url,
            headers: e.headers,
            body: e.body,
            duplex: e.duplex,
          },
          n = e[Symbol.for('WEBHOOK_RESPONSE_WRITABLE')];
        return n && (t.responseWritable = n), t;
      },
      Response: (e) => {
        let r = globalThis.Response;
        return !r ||
          (!(e instanceof r) && typeof e?.clone != 'function') ||
          typeof e?.status != 'number'
          ? !1
          : {
              type: e.type,
              url: e.url,
              status: e.status,
              statusText: e.statusText,
              headers: e.headers,
              body: e.body,
              redirected: e.redirected,
            };
      },
      ReadableStream: (e) => {
        if (e == null) return !1;
        let r = globalThis.ReadableStream;
        if (!r || !(e instanceof r || Object.getPrototypeOf(e) === r.prototype))
          return !1;
        let t = e[Symbol.for('BODY_INIT')];
        if (t !== void 0) return { bodyInit: t };
        let n = e[Symbol.for('STREAM_NAME')];
        if (n) {
          let o = { name: n },
            c = e[Symbol.for('STREAM_TYPE')];
          return c && (o.type = c), o;
        }
        return { name: '__empty' };
      },
      WritableStream: (e) => {
        if (e == null) return !1;
        let r = globalThis.WritableStream;
        return !r ||
          !(e instanceof r || Object.getPrototypeOf(e) === r.prototype)
          ? !1
          : { name: e[Symbol.for('STREAM_NAME')] || '__empty' };
      },
      Set: (e) => e instanceof Set && Array.from(e),
      URL: (e) => (typeof URL < 'u' && e instanceof URL ? e.href : !1),
      URLSearchParams: (e) =>
        typeof URLSearchParams < 'u' && e instanceof URLSearchParams
          ? e.size === 0
            ? '.'
            : String(e)
          : !1,
      Uint8Array: (e) => e instanceof Uint8Array && A(e),
      Uint8ClampedArray: (e) => e instanceof Uint8ClampedArray && A(e),
      Uint16Array: (e) => e instanceof Uint16Array && A(e),
      Uint32Array: (e) => e instanceof Uint32Array && A(e),
    };
  }
  function j() {
    return {
      ArrayBuffer: (e) => E(e),
      BigInt: (e) => BigInt(e),
      BigInt64Array: (e) => new BigInt64Array(E(e)),
      BigUint64Array: (e) => new BigUint64Array(E(e)),
      Date: (e) => new Date(e),
      Error: (e) => {
        let r = new Error(e.message);
        return (r.name = e.name), (r.stack = e.stack), r;
      },
      Float32Array: (e) => new Float32Array(E(e)),
      Float64Array: (e) => new Float64Array(E(e)),
      Int8Array: (e) => new Int8Array(E(e)),
      Int16Array: (e) => new Int16Array(E(e)),
      Int32Array: (e) => new Int32Array(E(e)),
      Map: (e) => new Map(e),
      RegExp: (e) => new RegExp(e.source, e.flags),
      Set: (e) => new Set(e),
      URL: (e) => (typeof URL < 'u' ? new URL(e) : e),
      URLSearchParams: (e) =>
        typeof URLSearchParams < 'u'
          ? new URLSearchParams(e === '.' ? '' : e)
          : e,
      Uint8Array: (e) => new Uint8Array(E(e)),
      Uint8ClampedArray: (e) => new Uint8ClampedArray(E(e)),
      Uint16Array: (e) => new Uint16Array(E(e)),
      Uint32Array: (e) => new Uint32Array(E(e)),
      Headers: (e) => new globalThis.Headers(e),
      Request: (e) => {
        let r = globalThis.Request;
        return (
          r &&
            ((e.json = r.prototype.json),
            (e.text = r.prototype.text),
            (e.arrayBuffer = r.prototype.arrayBuffer)),
          e.responseWritable &&
            (e[Symbol.for('WEBHOOK_RESPONSE_WRITABLE')] = e.responseWritable),
          e
        );
      },
      Response: (e) => {
        let r = globalThis.Response;
        return (
          r &&
            ((e.json = r.prototype.json),
            (e.text = r.prototype.text),
            (e.arrayBuffer = r.prototype.arrayBuffer),
            r.prototype.bytes && (e.bytes = r.prototype.bytes),
            r.prototype.clone && (e.clone = r.prototype.clone)),
          (e._body = e.body),
          (e.ok = e.status >= 200 && e.status < 300),
          (e.bodyUsed = !1),
          e
        );
      },
      ReadableStream: (e) => {
        let r = globalThis.ReadableStream,
          t = Object.create(r ? r.prototype : {});
        return (
          e && 'bodyInit' in e
            ? (t[Symbol.for('BODY_INIT')] = e.bodyInit)
            : e &&
              'name' in e &&
              ((t[Symbol.for('STREAM_NAME')] = e.name),
              e.type && (t[Symbol.for('STREAM_TYPE')] = e.type)),
          t
        );
      },
      WritableStream: (e) => {
        let r = globalThis.WritableStream,
          t = Object.create(r ? r.prototype : {});
        return e && 'name' in e && (t[Symbol.for('STREAM_NAME')] = e.name), t;
      },
    };
  }
  function _e() {
    return {
      StepFunction: (e) => {
        if (typeof e != 'function') return !1;
        let r = e.stepId;
        if (typeof r != 'string') return !1;
        let t = e.__closureVarsFn;
        if (t && typeof t == 'function') {
          let n = t();
          return { stepId: r, closureVars: n };
        }
        return { stepId: r };
      },
    };
  }
  function Se(e = globalThis) {
    let r = e[Symbol.for('WORKFLOW_USE_STEP')];
    return {
      StepFunction: (t) => {
        let n = t.stepId,
          o = t.closureVars;
        if (!r)
          throw new Error(
            'WORKFLOW_USE_STEP not found on global object. Step functions cannot be deserialized outside workflow context.'
          );
        return o ? r(n, () => o) : r(n);
      },
    };
  }
  var Ge = new TextEncoder(),
    Ye = new TextDecoder();
  function ve(e) {
    switch (e) {
      case 'workflow':
        return { ...B(), ..._e(), ...$() };
      case 'step':
        return { ...B(), ...$() };
      case 'client':
        return { ...B(), ...$() };
    }
  }
  function xe(e) {
    switch (e) {
      case 'workflow':
        return { ...W(), ...Se(), ...j() };
      case 'step':
        return { ...W(), ...j() };
      case 'client':
        return {
          ...W(),
          ...j(),
          StepFunction: () => {
            throw new Error(
              'Step functions cannot be deserialized in client context.'
            );
          },
        };
    }
  }
  var M = {
    formatPrefix: L.DEVALUE_V1,
    serialize(e, r) {
      let t = ve(r),
        n = Y(e, t);
      return Ge.encode(n);
    },
    deserialize(e, r) {
      let t = xe(r),
        n = Ye.decode(e);
      return H(n, t);
    },
    deserializeLegacy(e, r) {
      let t = xe(r);
      return P(e, t);
    },
  };
  var Q = 4,
    ee,
    re;
  function qe() {
    return ee || (ee = new globalThis.TextEncoder()), ee;
  }
  function Xe() {
    return re || (re = new globalThis.TextDecoder()), re;
  }
  function te(e) {
    let r = M.serialize(e, 'workflow'),
      t = qe().encode(L.DEVALUE_V1),
      n = new Uint8Array(t.length + r.length);
    return n.set(t, 0), n.set(r, t.length), n;
  }
  function ne(e) {
    if (!(e instanceof Uint8Array)) {
      if (M.deserializeLegacy) return M.deserializeLegacy(e, 'workflow');
      throw new Error(
        'Cannot deserialize non-binary data without legacy support'
      );
    }
    if (e.length < Q)
      throw new Error('Data too short to contain format prefix');
    let r = Xe().decode(e.subarray(0, Q));
    if (!Ae(r)) throw new Error(`Invalid format prefix: "${r}"`);
    if (r === L.DEVALUE_V1) {
      let t = e.subarray(Q);
      return M.deserialize(t, 'workflow');
    }
    throw new Error(`Unsupported serialization format: ${r}`);
  }
  typeof globalThis.TextEncoder > 'u' && (globalThis.TextEncoder = T);
  typeof globalThis.TextDecoder > 'u' && (globalThis.TextDecoder = O);
  globalThis[Symbol.for('workflow-serialize')] = te;
  globalThis[Symbol.for('workflow-deserialize')] = ne;
  globalThis.__wdk_serialize = te;
  globalThis.__wdk_deserialize = ne;
  var Je = globalThis.__ulidPrng ?? Math.random,
    Qe = fe(Je);
  globalThis.__generateUlid = () => Qe(Date.now());
})();
