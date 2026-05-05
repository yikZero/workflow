/**
 * Lazy loader for getPort that prevents bundlers (Turbopack, esbuild)
 * from statically tracing @workflow/utils/get-port and its filesystem
 * operations (readdir, readFile, readlink) into the flow route bundle.
 *
 * Uses createRequire with a dynamically constructed specifier so the
 * dependency is invisible to bundler static analysis.
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

let _getPort: (() => Promise<number | undefined>) | undefined;

export async function getPortLazy(): Promise<number | undefined> {
  if (!_getPort) {
    // Construct specifier at runtime to defeat bundler static analysis.
    const spec = ['@workflow/utils', 'get-port'].join('/');
    // Two resolution attempts so this works in both pnpm-strict app
    // bundles (where the app's package.json doesn't list
    // @workflow/utils as a direct dep) and in re-bundled CJS outputs:
    //
    // 1) Resolve from process.cwd() — works for hoisted-node_modules
    //    layouts where @workflow/utils is reachable from the app root.
    // 2) Fall back to this module's own location — works when the
    //    consumer is pnpm-strict (transitive deps invisible from cwd)
    //    but @workflow/utils IS available as a peer of @workflow/core.
    //
    // Mirrors the dual-resolution pattern in `world.ts:getRuntimeRequire`.
    let mod: { getPort?: () => Promise<number | undefined> } | undefined;
    try {
      const _require = createRequire(
        pathToFileURL(process.cwd() + '/package.json').href
      );
      mod = _require(spec);
    } catch {
      try {
        // import.meta.url is undefined in CJS re-bundled outputs, but
        // when it's present it points at @workflow/core's own location
        // where @workflow/utils is always installed as a dep.
        if (typeof import.meta?.url === 'string') {
          const _require = createRequire(import.meta.url);
          mod = _require(spec);
        }
      } catch {
        // Fall through to undefined-getPort fallback
      }
    }
    _getPort = mod?.getPort ?? (async () => undefined);
  }
  return _getPort!();
}
