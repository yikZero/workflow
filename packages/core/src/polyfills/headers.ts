/**
 * Pure JavaScript Headers polyfill for the QuickJS VM.
 *
 * Adapted from nx.js (https://github.com/TooTallNate/nx.js)
 *
 * @copyright Apache License 2.0
 */

type HeadersInit = [string, string][] | Record<string, string> | Headers;

type HeadersIterator<T> = IterableIterator<T>;

function normalizeName(v: unknown) {
  const name = typeof v === 'string' ? v : String(v);
  if (/[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(name) || name === '') {
    throw new TypeError(`Invalid character in header field name: "${name}"`);
  }
  return name.toLowerCase();
}

function normalizeValue(v: unknown) {
  const s = typeof v === 'string' ? v : String(v);
  return s.replace(/^[\t ]+|[\t ]+$/g, '');
}

const getValues = (v: string[]) => v.join(', ');

export class Headers {
  private _map = new Map<string, string[]>();

  constructor(init?: HeadersInit) {
    // Build the map directly to minimize call stack depth
    // (important for QuickJS WASM where stack space is limited)
    const map = this._map;
    if (init instanceof Headers) {
      for (const [k, v] of init._map) {
        map.set(k, [...v]);
      }
    } else if (Array.isArray(init)) {
      for (let i = 0; i < init.length; i++) {
        const h = init[i];
        const n = normalizeName(h[0]);
        const v = normalizeValue(h[1]);
        const a = map.get(n);
        if (a) a.push(v);
        else map.set(n, [v]);
      }
    } else if (init) {
      for (const k of Object.getOwnPropertyNames(init)) {
        map.set(normalizeName(k), [
          normalizeValue((init as Record<string, string>)[k]),
        ]);
      }
    }
  }

  append(name: string, value: string): void {
    name = normalizeName(name);
    value = normalizeValue(value);
    const map = this._map;
    let values = map.get(name);
    if (!values) {
      values = [];
      map.set(name, values);
    }
    values.push(value);
  }

  delete(name: string): void {
    this._map.delete(normalizeName(name));
  }

  get(name: string): string | null {
    const values = this._map.get(normalizeName(name));
    return values ? getValues(values) : null;
  }

  getSetCookie(): string[] {
    return [...(this._map.get('set-cookie') || [])];
  }

  has(name: string): boolean {
    return this._map.has(normalizeName(name));
  }

  set(name: string, value: string): void {
    this._map.set(normalizeName(name), [normalizeValue(value)]);
  }

  forEach(
    callbackfn: (value: string, key: string, parent: Headers) => void,
    thisArg?: unknown
  ): void {
    for (const [name, value] of this.entries()) {
      callbackfn.call(thisArg, value, name, this);
    }
  }

  *entries(): HeadersIterator<[string, string]> {
    const sorted = [...this._map.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
    );
    for (const [name, values] of sorted) {
      if (name === 'set-cookie') {
        for (const value of values) {
          yield [name, value];
        }
      } else {
        yield [name, getValues(values)];
      }
    }
  }

  *keys(): HeadersIterator<string> {
    for (const [name] of this.entries()) {
      yield name;
    }
  }

  *values(): HeadersIterator<string> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  [Symbol.iterator](): HeadersIterator<[string, string]> {
    return this.entries();
  }
}
