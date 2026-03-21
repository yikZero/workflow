#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Resolve the path to the SWC workflow plugin.
 * This works because @workflow/nest has @workflow/swc-plugin as a dependency.
 */
function resolveSwcPluginPath(): string {
  return require.resolve('@workflow/swc-plugin', {
    paths: [__dirname],
  });
}

/**
 * Generate .swcrc configuration for NestJS with the workflow plugin.
 */
function generateSwcrc(
  pluginPath: string,
  moduleType: 'es6' | 'commonjs' = 'es6'
): object {
  return {
    $schema: 'https://swc.rs/schema.json',
    jsc: {
      parser: {
        syntax: 'typescript',
        decorators: true,
      },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
      },
      experimental: {
        plugins: [[pluginPath, { mode: 'client' }]],
      },
    },
    module: {
      type: moduleType,
    },
    sourceMaps: true,
  };
}

function showHelp(): void {
  console.log(`
@workflow/nest CLI

Commands:
  init    Generate .swcrc configuration with the workflow plugin
  build   Build workflow bundles (and Vercel Build Output API when on Vercel)
  help    Show this help message

Usage:
  npx @workflow/nest init [options]
  npx @workflow/nest build [options]

Init Options:
  --module <type>  SWC module type: 'es6' (default) or 'commonjs'
  --force          Overwrite existing .swcrc file

Build Options:
  --entry <path>   Vercel serverless entry point (default: auto-detected from api/)
  --module <type>  SWC module type: 'es6' (default) or 'commonjs'
  --dirs <dirs>    Comma-separated source directories (default: 'src')
  --out-dir <dir>  Output directory for bundles (default: '.nestjs/workflow')

The build command generates workflow bundles (steps, workflows, webhook).
When running on Vercel (VERCEL env set), it also generates the Build Output
API with experimentalTriggers so VQS can discover workflow consumers.
`);
}

function hasWorkflowPlugin(swcrcContent: string): boolean {
  try {
    const parsed = JSON.parse(swcrcContent);
    const plugins = parsed?.jsc?.experimental?.plugins;
    return (
      Array.isArray(plugins) &&
      plugins.some(
        (p) =>
          Array.isArray(p) &&
          typeof p[0] === 'string' &&
          p[0].includes('workflow')
      )
    );
  } catch {
    return false;
  }
}

import { parseModuleType as parseModuleTypeRaw } from './parse-module-type.js';

function parseModuleType(args: string[]): 'es6' | 'commonjs' {
  const result = parseModuleTypeRaw(args);
  if (result === null) {
    const idx = args.indexOf('--module');
    const value = idx >= 0 && idx + 1 < args.length ? args[idx + 1] : '';
    console.error(
      `Invalid module type: ${value}. Must be 'es6' or 'commonjs'.`
    );
    process.exit(1);
  }
  return result;
}

function handleInit(args: string[]): void {
  const swcrcPath = resolve(process.cwd(), '.swcrc');
  const forceMode = args.includes('--force');
  const moduleType = parseModuleType(args);

  if (existsSync(swcrcPath)) {
    const existing = readFileSync(swcrcPath, 'utf-8');

    if (hasWorkflowPlugin(existing)) {
      console.log('✓ .swcrc already configured with workflow plugin');
      if (!forceMode) {
        console.log('  Run with --force to regenerate');
        process.exit(0);
      }
    } else if (!forceMode) {
      console.log('⚠ .swcrc already exists. Run with --force to overwrite.');
      process.exit(1);
    }
  }

  const pluginPath = resolveSwcPluginPath();
  const swcrc = generateSwcrc(pluginPath, moduleType);

  writeFileSync(swcrcPath, `${JSON.stringify(swcrc, null, 2)}\n`);
  console.log('✓ Created .swcrc with workflow plugin configuration');
  console.log(`  Plugin path: ${pluginPath}`);
  console.log('\nNext steps:');
  console.log(
    '1. Ensure nest-cli.json has: "compilerOptions": { "builder": "swc" }'
  );
  console.log('2. Add .swcrc to .gitignore (it contains absolute paths)');
  console.log('3. Run: nest build');
}

/**
 * Auto-detect the Vercel serverless entry point.
 * Prefers _vercel/ directory to avoid triggering Vercel's automatic
 * serverless function detection on the api/ directory.
 */
function detectEntryPoint(): string | null {
  const candidates = [
    '_vercel/entry.js',
    '_vercel/entry.ts',
    'api/index.js',
    'api/index.ts',
    'api/index.mjs',
    'api/server.js',
    'api/server.ts',
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(process.cwd(), candidate))) {
      return candidate;
    }
  }
  return null;
}

function parseArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

async function handleBuild(args: string[]): Promise<void> {
  const { NestLocalBuilder } = await import('./builder.js');

  const moduleType = parseModuleType(args);
  const dirs = parseArg(args, '--dirs')?.split(',') ?? ['src'];
  const outDir = parseArg(args, '--out-dir');

  const builder = new NestLocalBuilder({
    workingDir: process.cwd(),
    dirs,
    moduleType,
    ...(outDir ? { outDir } : {}),
  });

  // Always build workflow bundles
  await builder.build();

  // Copy manifest to dist/ so @vercel/nft includes it in the Lambda.
  // NFT traces readFileSync paths relative to the file containing the call.
  // The app.module reads from ./workflow-manifest.json (relative to dist/).
  const { copyFile } = await import('node:fs/promises');
  const { join: pathJoin } = await import('node:path');
  try {
    await copyFile(
      pathJoin(builder.outDir, 'manifest.json'),
      pathJoin(process.cwd(), 'dist', 'workflow-manifest.json')
    );
    console.log(
      '[@workflow/nest] Copied manifest to dist/workflow-manifest.json'
    );
  } catch {
    // manifest may not exist (no workflows discovered)
  }

  // On Vercel, also generate Build Output API with experimentalTriggers
  if (process.env.VERCEL) {
    const entryPoint = parseArg(args, '--entry') ?? detectEntryPoint();
    if (!entryPoint) {
      console.error(
        '[@workflow/nest] Could not auto-detect Vercel entry point.\n' +
          'Create an api/index.js file or pass --entry <path>.'
      );
      process.exit(1);
    }
    if (!existsSync(resolve(process.cwd(), entryPoint))) {
      console.error(
        `[@workflow/nest] Entry point not found: ${entryPoint}\n` +
          'Ensure the file exists or pass a valid --entry <path>.'
      );
      process.exit(1);
    }
    console.log(
      `[@workflow/nest] Detected Vercel — generating Build Output API (entry: ${entryPoint})`
    );
    await builder.buildVercelOutput({ entryPoint });
  }
}

/**
 * Main CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    showHelp();
    process.exit(0);
  }

  if (command === 'init') {
    handleInit(args);
    process.exit(0);
  }

  if (command === 'build') {
    await handleBuild(args);
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run with --help for usage information.');
  process.exit(1);
}

main();
