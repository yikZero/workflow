import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BaseBuilder,
  createBaseBuilderConfig,
  STEP_QUEUE_TRIGGER,
  WORKFLOW_QUEUE_TRIGGER,
} from '@workflow/builders';
import * as esbuild from 'esbuild';
import { join } from 'pathe';
import { rewriteTsImportsInContent } from './cjs-rewrite.js';

export interface NestBuilderOptions {
  /**
   * Working directory for the NestJS application
   * @default process.cwd()
   */
  workingDir?: string;
  /**
   * Directories to scan for workflow files
   * @default ['src']
   */
  dirs?: string[];
  /**
   * Output directory for generated workflow bundles
   * @default '.nestjs/workflow'
   */
  outDir?: string;
  /**
   * Enable watch mode for development
   * @default false
   */
  watch?: boolean;
  /**
   * SWC module compilation type.
   * Set to 'commonjs' if your NestJS project compiles to CJS via SWC.
   * When 'commonjs', the builder rewrites externalized imports in the
   * steps bundle to use require() via createRequire, avoiding ESM/CJS
   * named-export interop issues with SWC's _export() wrapper pattern.
   * @default 'es6'
   */
  moduleType?: 'es6' | 'commonjs';
  /**
   * Directory where NestJS compiles .ts source files to .js (relative to workingDir).
   * Used when moduleType is 'commonjs' to resolve compiled file paths.
   * This should match the `outDir` in your tsconfig.json.
   * @default 'dist'
   */
  distDir?: string;
}

export interface NestVercelOutputOptions extends NestBuilderOptions {
  /**
   * Path to the serverless function entry point (relative to workingDir).
   * This file should export a default request handler (e.g. Express app).
   * @example 'api/index.js'
   */
  entryPoint: string;
  /**
   * Maximum duration in seconds for the NestJS serverless function.
   * @default 300
   */
  maxDuration?: number;
  /**
   * Additional routes to include in the Build Output API config.json.
   * These are merged with the workflow webhook route.
   */
  additionalRoutes?: Array<{ src: string; dest: string }>;
}

export class NestLocalBuilder extends BaseBuilder {
  #outDir: string;
  #moduleType: 'es6' | 'commonjs';
  #distDir: string;
  #dirs: string[];
  #workingDir: string;

  constructor(options: NestBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const outDir = options.outDir ?? join(workingDir, '.nestjs/workflow');
    const dirs = options.dirs ?? ['src'];
    super({
      ...createBaseBuilderConfig({
        workingDir,
        watch: options.watch ?? false,
        dirs,
      }),
      // Use 'standalone' as base target - we handle the specific bundling ourselves
      buildTarget: 'standalone',
      stepsBundlePath: join(outDir, 'steps.mjs'),
      workflowsBundlePath: join(outDir, 'workflows.mjs'),
      webhookBundlePath: join(outDir, 'webhook.mjs'),
    });
    this.#outDir = outDir;
    this.#moduleType = options.moduleType ?? 'es6';
    this.#distDir = options.distDir ?? 'dist';
    this.#dirs = dirs;
    this.#workingDir = workingDir;
  }

  get outDir(): string {
    return this.#outDir;
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    await mkdir(this.#outDir, { recursive: true });

    const { manifest: workflowsManifest } = await this.createWorkflowsBundle({
      outfile: join(this.#outDir, 'workflows.mjs'),
      bundleFinalOutput: false,
      format: 'esm',
      inputFiles,
    });

    const { manifest: stepsManifest } = await this.createStepsBundle({
      outfile: join(this.#outDir, 'steps.mjs'),
      externalizeNonSteps: true,
      format: 'esm',
      inputFiles,
    });

    // When the NestJS project compiles to CJS via SWC, the ESM steps bundle
    // can't import named exports from CJS files because cjs-module-lexer
    // doesn't recognize SWC's _export() wrapper pattern.
    // Rewrite externalized .ts imports to use require() via createRequire.
    if (this.#moduleType === 'commonjs') {
      await this.#rewriteStepsBundleForCjs();
    }

    await this.createWebhookBundle({
      outfile: join(this.#outDir, 'webhook.mjs'),
      bundle: false,
    });

    // Merge manifests from both bundles
    const manifest = {
      steps: { ...stepsManifest.steps, ...workflowsManifest.steps },
      workflows: { ...stepsManifest.workflows, ...workflowsManifest.workflows },
      classes: { ...stepsManifest.classes, ...workflowsManifest.classes },
    };

    // Generate manifest
    await this.createManifest({
      workflowBundlePath: join(this.#outDir, 'workflows.mjs'),
      manifestDir: this.#outDir,
      manifest,
    });

    // Create .gitignore to exclude generated files
    if (!process.env.VERCEL_DEPLOYMENT_ID) {
      await writeFile(join(this.#outDir, '.gitignore'), '*\n');
    }
  }

  /**
   * Build Vercel Build Output API functions for workflow routes.
   * Generates self-contained serverless functions at
   * `.vercel/output/functions/.well-known/workflow/v1/` with
   * `experimentalTriggers` in `.vc-config.json` so VQS can discover consumers.
   *
   * Also bundles the NestJS app entry point as a catch-all Build Output API
   * function and writes `config.json` with routing rules.
   */
  async buildVercelOutput(
    vercelOptions: Omit<NestVercelOutputOptions, keyof NestBuilderOptions>
  ): Promise<void> {
    const outputDir = resolve(this.#workingDir, '.vercel/output');
    const functionsDir = join(outputDir, 'functions');
    const workflowGeneratedDir = join(functionsDir, '.well-known/workflow/v1');

    await mkdir(workflowGeneratedDir, { recursive: true });

    const inputFiles = await this.getInputFiles();
    const tsconfigPath = await this.findTsConfigPath();

    // Build step function with experimentalTriggers
    console.log(
      '[@workflow/nest] Creating Vercel Build Output API step function'
    );
    const stepsFuncDir = join(workflowGeneratedDir, 'step.func');
    await mkdir(stepsFuncDir, { recursive: true });
    const { manifest: stepsManifest } = await this.createStepsBundle({
      inputFiles,
      outfile: join(stepsFuncDir, 'index.js'),
      tsconfigPath,
    });
    await this.createPackageJson(stepsFuncDir, 'commonjs');
    await this.createVcConfig(stepsFuncDir, {
      shouldAddSourcemapSupport: true,
      maxDuration: 'max',
      experimentalTriggers: [STEP_QUEUE_TRIGGER],
    });

    // Build flow function with experimentalTriggers
    console.log(
      '[@workflow/nest] Creating Vercel Build Output API flow function'
    );
    const flowFuncDir = join(workflowGeneratedDir, 'flow.func');
    await mkdir(flowFuncDir, { recursive: true });
    const { manifest: workflowsManifest } = await this.createWorkflowsBundle({
      outfile: join(flowFuncDir, 'index.js'),
      inputFiles,
      tsconfigPath,
    });
    await this.createPackageJson(flowFuncDir, 'commonjs');
    await this.createVcConfig(flowFuncDir, {
      maxDuration: 60,
      experimentalTriggers: [WORKFLOW_QUEUE_TRIGGER],
    });

    // Build webhook function
    console.log(
      '[@workflow/nest] Creating Vercel Build Output API webhook function'
    );
    const webhookFuncDir = join(workflowGeneratedDir, 'webhook/[token].func');
    await this.createWebhookBundle({
      outfile: join(webhookFuncDir, 'index.js'),
      bundle: true,
    });
    await this.createPackageJson(webhookFuncDir, 'commonjs');
    await this.createVcConfig(webhookFuncDir, {
      shouldAddHelpers: false,
    });

    // Merge manifests and generate unified manifest
    const manifest = {
      steps: { ...stepsManifest.steps, ...workflowsManifest.steps },
      workflows: {
        ...stepsManifest.workflows,
        ...workflowsManifest.workflows,
      },
      classes: { ...stepsManifest.classes, ...workflowsManifest.classes },
    };
    await this.createManifest({
      workflowBundlePath: join(flowFuncDir, 'index.js'),
      manifestDir: workflowGeneratedDir,
      manifest,
    });

    // Bundle the NestJS entry point as a self-contained Build Output API
    // function using esbuild. The entry point (e.g. api/index.js) and all its
    // dependencies (dist/, node_modules/) are bundled into a single file.
    console.log(
      '[@workflow/nest] Bundling NestJS entry point for Vercel Build Output API'
    );
    const entryPointPath = resolve(this.#workingDir, vercelOptions.entryPoint);
    // Avoid dots in .func directory names — Build Output API doesn't
    // reliably match function dirs containing periods.
    const entryFuncDir = join(functionsDir, '__nestjs.func');
    await mkdir(entryFuncDir, { recursive: true });

    await esbuild.build({
      entryPoints: [entryPointPath],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outfile: join(entryFuncDir, 'index.mjs'),
      // Mark Node.js built-in modules and known optional NestJS
      // peer dependencies as external. These are loaded via dynamic
      // require() in try/catch blocks — they're not needed at runtime
      // unless the customer explicitly uses them.
      external: [
        'node:*',
        // NestJS optional peer dependencies
        '@nestjs/websockets',
        '@nestjs/websockets/*',
        '@nestjs/microservices',
        '@nestjs/microservices/*',
        '@nestjs/platform-fastify',
        'class-validator',
        'class-transformer',
        'cache-manager',
        // SWC native bindings (not needed at runtime for the app function)
        '@swc/*',
        '*.node',
      ],
      logLevel: 'warning',
      // Preserve class names for NestJS dependency injection
      keepNames: true,
      sourcemap: false,
      minify: false,
    });
    await this.createPackageJson(entryFuncDir, 'module');
    await this.createVcConfig(entryFuncDir, {
      handler: 'index.mjs',
      maxDuration: vercelOptions.maxDuration ?? 300,
    });

    // Copy manifest.json into the NestJS function directory so the
    // WorkflowController can serve it at runtime via readFileSync.
    // The controller reads from configuredOutDir which defaults to
    // .nestjs/workflow — we create that path inside the function dir.
    const nestjsWorkflowDir = join(entryFuncDir, '.nestjs', 'workflow');
    await mkdir(nestjsWorkflowDir, { recursive: true });
    const manifestSrc = join(workflowGeneratedDir, 'manifest.json');
    try {
      const manifestContent = await readFile(manifestSrc, 'utf-8');
      await writeFile(
        join(nestjsWorkflowDir, 'manifest.json'),
        manifestContent
      );
      console.log(
        '[@workflow/nest] Copied manifest.json into NestJS function for runtime serving'
      );
    } catch {
      console.warn(
        '[@workflow/nest] Could not copy manifest.json into NestJS function'
      );
    }

    // Write Build Output API config.json with routing.
    // handle:filesystem matches workflow functions (step, flow, webhook).
    // handle:miss ensures the NestJS catch-all only runs for paths that
    // don't match any function — including manifest.json which the NestJS
    // WorkflowController serves at runtime.
    const routes = [
      {
        src: '^\\/\\.well-known\\/workflow\\/v1\\/webhook\\/([^\\/]+)$',
        dest: '/.well-known/workflow/v1/webhook/[token]',
      },
      { handle: 'filesystem' as const },
      { handle: 'miss' as const },
      ...(vercelOptions.additionalRoutes ?? []),
      {
        src: '/(.*)',
        dest: '/__nestjs',
      },
    ];

    await writeFile(
      join(outputDir, 'config.json'),
      JSON.stringify({ version: 3, routes }, null, 2)
    );

    console.log(`[@workflow/nest] Build Output API created at ${outputDir}`);
    console.log(
      '[@workflow/nest] Workflow functions: step, flow, webhook registered with experimentalTriggers'
    );
  }

  /**
   * Rewrite externalized .ts/.tsx imports in the steps bundle to use require()
   * for CommonJS compatibility.
   *
   * When NestJS compiles to CJS via SWC, the ESM steps bundle can't import
   * named exports from CJS files because cjs-module-lexer doesn't recognize
   * SWC's _export() wrapper pattern. This rewrites the imports to use
   * createRequire() and points them to the compiled .js files in distDir.
   */
  async #rewriteStepsBundleForCjs(): Promise<void> {
    const stepsPath = join(this.#outDir, 'steps.mjs');
    const stepsContent = await readFile(stepsPath, 'utf-8');

    const { content: rewritten, matchCount } = rewriteTsImportsInContent(
      stepsContent,
      {
        outDir: this.#outDir,
        workingDir: this.#workingDir,
        distDir: this.#distDir,
        dirs: this.#dirs,
      }
    );

    if (matchCount === 0) {
      console.warn(
        '[@workflow/nest] No .ts/.tsx imports found to rewrite for CommonJS. ' +
          "If you expected externalized imports, esbuild's output format may have changed."
      );
      return;
    }

    const requireShim = [
      `import { createRequire as __bundled_createRequire } from 'node:module';`,
      `const require = __bundled_createRequire(import.meta.url);`,
      ``,
    ].join('\n');

    await writeFile(stepsPath, requireShim + rewritten);
  }
}
