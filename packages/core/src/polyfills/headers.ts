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
  #map = new Map<string, string[]>();

  constructor(init?: HeadersInit) {
    if (init instanceof Headers) {
      for (const [name, value] of init) {
        this.append(name, value);
      }
    } else if (Array.isArray(init)) {
      for (const header of init) {
        if (header.length !== 2) {
          throw new TypeError(
            `Headers constructor: expected name/value pair to be length 2, found: ${header.length}`
          );
        }
        this.append(header[0], header[1]);
      }
    } else if (init) {
      for (const name of Object.getOwnPropertyNames(init)) {
        this.append(name, (init as Record<string, string>)[name]);
      }
    }
  }

  append(name: string, value: string): void {
    name = normalizeName(name);
    value = normalizeValue(value);
    const map = this.#map;
    let values = map.get(name);
    if (!values) {
      values = [];
      map.set(name, values);
    }
    values.push(value);
  }

  delete(name: string): void {
    this.#map.delete(normalizeName(name));
  }

  get(name: string): string | null {
    const values = this.#map.get(normalizeName(name));
    return values ? getValues(values) : null;
  }

  getSetCookie(): string[] {
    return [...(this.#map.get('set-cookie') || [])];
  }

  has(name: string): boolean {
    return this.#map.has(normalizeName(name));
  }

  set(name: string, value: string): void {
    this.#map.set(normalizeName(name), [normalizeValue(value)]);
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
    const sorted = [...this.#map.entries()].sort((a, b) =>
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
