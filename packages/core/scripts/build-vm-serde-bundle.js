/**
 * Build script: generates the VM serialization bundle.
 *
 * Uses esbuild to bundle workflow-vm.ts + TextEncoder/TextDecoder polyfills
 * into a self-contained IIFE. The output is written as a standalone .js file
 * that is read from disk at runtime by the snapshot runtime.
 *
 * The polyfills are injected via esbuild's `inject` option to ensure they
 * run before any other code (including module-level TextEncoder/TextDecoder
 * instantiation).
 */

import { buildSync } from 'esbuild';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src');

const result = buildSync({
  entryPoints: [resolve(srcDir, 'serialization/vm-bundle-entry.ts')],
  inject: [resolve(srcDir, 'polyfills/install-text-coding.ts')],
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
  write: false,
  minify: true,
});

const bundleCode = result.outputFiles[0].text;

// Write the bundle as a plain .js file. The snapshot runtime reads this
// from disk at runtime, avoiding any escaping issues that arise when
// embedding JS source inside a JS string literal.
const outPath = resolve(srcDir, 'runtime/vm-serde-bundle.generated.js');
writeFileSync(outPath, bundleCode);

console.log(
  `Generated vm-serde-bundle.generated.js (${(bundleCode.length / 1024).toFixed(1)} KB)`
);
