import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseBuilder, type DiscoveredEntries } from './base-builder.js';
import type { StandaloneConfig } from './types.js';

class TestBuilder extends BaseBuilder {
  async build(): Promise<void> {
    // no-op
  }

  public createStepsBundlePublic(options: {
    inputFiles: string[];
    outfile: string;
    discoveredEntries: DiscoveredEntries;
  }) {
    return this.createStepsBundle({
      ...options,
      externalizeNonSteps: true,
    });
  }
}

const realTmpdir = realpathSync(tmpdir());

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf-8');
}

function createBuilder(workingDir: string): TestBuilder {
  const config: StandaloneConfig = {
    buildTarget: 'standalone',
    workingDir,
    dirs: ['.'],
    stepsBundlePath: join(workingDir, 'steps.js'),
    workflowsBundlePath: join(workingDir, 'workflows.js'),
    webhookBundlePath: join(workingDir, 'webhook.js'),
  };
  return new TestBuilder(config);
}

describe('BaseBuilder createStepsBundle', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(realTmpdir, 'workflow-base-builder-'));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('registers workflow internal builtins from the package export only', async () => {
    const srcBuiltins = join(
      testRoot,
      'packages/workflow/src/internal/builtins.ts'
    );
    const distBuiltins = join(
      testRoot,
      'node_modules/workflow/dist/internal/builtins.js'
    );

    writeFile(
      join(testRoot, 'node_modules/workflow/package.json'),
      JSON.stringify({
        name: 'workflow',
        version: '1.0.0',
        type: 'module',
        exports: {
          './internal/builtins': './dist/internal/builtins.js',
        },
      })
    );
    writeFile(
      srcBuiltins,
      `export async function __builtin_response_text() {
  'use step';
  return this.text();
}`
    );
    writeFile(
      distBuiltins,
      `export async function __builtin_response_text() {
  'use step';
  return this.text();
}`
    );

    const outfile = join(testRoot, 'out/steps.js');
    mkdirSync(dirname(outfile), { recursive: true });
    const result = await createBuilder(testRoot).createStepsBundlePublic({
      inputFiles: [],
      outfile,
      discoveredEntries: {
        discoveredSteps: new Set([srcBuiltins]),
        discoveredWorkflows: new Set(),
        discoveredSerdeFiles: new Set(),
      },
    });

    expect(result.manifest.steps).toEqual({
      'node_modules/workflow/dist/internal/builtins.js': {
        __builtin_response_text: {
          stepId: '__builtin_response_text',
        },
      },
    });
    await expect(readFile(outfile, 'utf8')).resolves.not.toContain(
      'packages/workflow/src/internal/builtins'
    );
  });

  it('prefers package dist step files when source and dist copies are discovered', async () => {
    const sourceStep = join(testRoot, 'packages/agent/src/do-stream-step.ts');
    const distStep = join(testRoot, 'packages/agent/dist/do-stream-step.js');

    writeFile(
      join(testRoot, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: {
          '@internal/agent': 'workspace:*',
          workflow: '1.0.0',
        },
      })
    );
    writeFile(
      join(testRoot, 'packages/agent/package.json'),
      JSON.stringify({
        name: '@internal/agent',
        version: '1.0.0',
        type: 'module',
        exports: {
          './agent': './dist/agent.js',
        },
      })
    );
    writeFile(
      join(testRoot, 'node_modules/workflow/package.json'),
      JSON.stringify({
        name: 'workflow',
        version: '1.0.0',
        type: 'module',
        exports: {
          './internal/builtins': './dist/internal/builtins.js',
        },
      })
    );
    writeFile(
      join(testRoot, 'node_modules/workflow/dist/internal/builtins.js'),
      `export async function __builtin_response_text() {
  'use step';
}`
    );
    writeFile(
      sourceStep,
      `export async function doStreamStep() {
  'use step';
}`
    );
    writeFile(
      distStep,
      `export async function doStreamStep() {
  'use step';
}`
    );

    const outfile = join(testRoot, 'out/steps.js');
    mkdirSync(dirname(outfile), { recursive: true });
    const result = await createBuilder(testRoot).createStepsBundlePublic({
      inputFiles: [],
      outfile,
      discoveredEntries: {
        discoveredSteps: new Set([sourceStep, distStep]),
        discoveredWorkflows: new Set(),
        discoveredSerdeFiles: new Set(),
      },
    });

    expect(result.manifest.steps).toMatchObject({
      'packages/agent/dist/do-stream-step.js': {
        doStreamStep: {
          stepId:
            'step//@internal/agent/dist/do-stream-step@1.0.0//doStreamStep',
        },
      },
    });
    expect(result.manifest.steps).not.toHaveProperty(
      'packages/agent/src/do-stream-step.ts'
    );
    await expect(readFile(outfile, 'utf8')).resolves.not.toContain(
      'packages/agent/src/do-stream-step'
    );
  });
});
