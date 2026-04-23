export interface ModuleOptions {
  /** @internal */
  _vite?: boolean;

  /**
   * Directories to scan for workflows and steps.
   *
   * By default, `workflows/` directory will be scanned from root and all layer source dirs.
   */
  dirs?: string[];

  /**
   * Enable workflow TypeScript plugin in generated tsconfig.json
   * @default false
   */
  typescriptPlugin?: boolean;

  /**
   * Node.js runtime version for Vercel Functions.
   * @example "nodejs22.x"
   * @example "nodejs24.x"
   */
  runtime?: string;

  /**
   * Sourcemap mode for generated workflow bundles. Accepts the same values
   * as esbuild's `sourcemap` option: `true` / `'linked'`, `'inline'`,
   * `'external'`, `'both'`, or `false`.
   *
   * If unset, the value of the `WORKFLOW_SOURCEMAP` environment variable is
   * consulted. If neither is set, the builder's default (`'inline'`) is used.
   *
   * Setting this to `false` can dramatically reduce the generated function
   * bundle size when deploying to Vercel (useful for staying under the 250MB
   * function size limit).
   */
  sourcemap?: boolean | 'inline' | 'linked' | 'external' | 'both';
}

declare module 'nitro/types' {
  interface NitroOptions {
    workflow?: ModuleOptions;
  }
}

// @ts-expect-error (legacy)
declare module 'nitropack' {
  interface NitroOptions {
    workflow?: ModuleOptions;
  }
}
