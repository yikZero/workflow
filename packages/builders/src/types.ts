export const validBuildTargets = [
  'standalone',
  'vercel-build-output-api',
  'next',
  'nest',
  'sveltekit',
  'astro',
] as const;
export type BuildTarget = (typeof validBuildTargets)[number];

/**
 * Sourcemap mode for generated workflow bundles. Matches the values
 * accepted by esbuild's `sourcemap` option.
 *
 * - `true` / `'linked'` — emit a separate `.map` file and append a
 *   `//# sourceMappingURL=` comment pointing to it.
 * - `'inline'` — inline the sourcemap as a base64 data URL in the bundle.
 * - `'external'` — emit a separate `.map` file without a reference comment.
 * - `'both'` — inline *and* emit a separate `.map` file.
 * - `false` — do not emit a sourcemap at all.
 */
export type SourcemapMode = boolean | 'inline' | 'linked' | 'external' | 'both';

/**
 * Common configuration options shared across all builder types.
 */
interface BaseWorkflowConfig {
  watch?: boolean;
  dirs: string[];
  workingDir: string;
  /**
   * Project root used for package and workspace module-specifier resolution
   * during SWC transforms. Defaults to `workingDir`.
   */
  projectRoot?: string;

  // Optionally generate a client library for workflow execution. The preferred
  // method of using workflow is to use a loader within a framework (like
  // NextJS) that resolves client bindings on the fly.
  clientBundlePath?: string;

  externalPackages?: string[];

  workflowManifestPath?: string;

  // Optional prefix for debug files (e.g., "_" for Astro to ignore them)
  debugFilePrefix?: string;

  // Suppress informational logs emitted by createWorkflowsBundle()
  // (e.g. intermediate/final workflow bundle timing logs).
  suppressCreateWorkflowsBundleLogs?: boolean;

  // Suppress esbuild warnings emitted by createWorkflowsBundle().
  suppressCreateWorkflowsBundleWarnings?: boolean;

  // Suppress informational logs emitted by createWebhookBundle().
  suppressCreateWebhookBundleLogs?: boolean;

  // Suppress informational logs emitted by createManifest().
  suppressCreateManifestLogs?: boolean;

  // Node.js runtime version for Vercel Functions (e.g., "nodejs22.x", "nodejs24.x")
  runtime?: string;

  /**
   * Sourcemap mode for generated workflow bundles (steps, workflows, webhook).
   *
   * Accepts the same values as esbuild's `sourcemap` option:
   * `true` / `'linked'`, `'inline'`, `'external'`, `'both'`, or `false`.
   *
   * If unset, the value of the `WORKFLOW_SOURCEMAP` environment variable is
   * consulted (valid values: `true`, `false`, `inline`, `linked`, `external`,
   * `both`). If neither is set, sourcemaps default to `'inline'` so stack
   * traces from step and workflow VM execution include original file names
   * and line numbers.
   *
   * Setting this to `false` can dramatically reduce the generated function
   * bundle size, which is useful for hitting Vercel's 250MB function size
   * limit.
   */
  sourcemap?: SourcemapMode;
}

/**
 * Configuration for standalone (CLI-based) builds.
 */
export interface StandaloneConfig extends BaseWorkflowConfig {
  buildTarget: 'standalone';
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Configuration for Vercel Build Output API builds.
 */
export interface VercelBuildOutputConfig extends BaseWorkflowConfig {
  buildTarget: 'vercel-build-output-api';
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Configuration for Next.js builds.
 */
export interface NextConfig extends BaseWorkflowConfig {
  buildTarget: 'next';
  // Next.js builder computes paths dynamically, so these are not used
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Configuration for SvelteKit builds.
 */
export interface SvelteKitConfig extends BaseWorkflowConfig {
  buildTarget: 'sveltekit';
  // SvelteKit builder computes paths dynamically, so these are not used
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Configuration for Astro builds.
 */
export interface AstroConfig extends BaseWorkflowConfig {
  buildTarget: 'astro';
  // Astro builder computes paths dynamically, so these are not used
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Configuration for NestJS builds.
 */
export interface NestConfig extends BaseWorkflowConfig {
  buildTarget: 'nest';
  // NestJS builder computes paths dynamically, so these are not used
  stepsBundlePath: string;
  workflowsBundlePath: string;
  webhookBundlePath: string;
}

/**
 * Discriminated union of all builder configuration types.
 */
export type WorkflowConfig =
  | StandaloneConfig
  | VercelBuildOutputConfig
  | NextConfig
  | NestConfig
  | SvelteKitConfig
  | AstroConfig;

export function isValidBuildTarget(
  target: string | undefined
): target is BuildTarget {
  return !!target && validBuildTargets.includes(target as BuildTarget);
}
