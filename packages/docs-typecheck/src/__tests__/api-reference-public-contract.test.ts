import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

type PackageJson = {
  name?: string;
  exports?: Record<string, unknown> | string;
};

type DocumentedContract = {
  file: string;
  module: string;
  values?: string[];
  types?: string[];
};

const documentedContracts: DocumentedContract[] = [
  {
    file: 'docs/content/docs/api-reference/workflow/create-hook.mdx',
    module: 'workflow',
    values: ['createHook'],
    types: ['HookOptions', 'Hook'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/create-webhook.mdx',
    module: 'workflow',
    values: ['createWebhook'],
    types: ['RequestWithResponse', 'WebhookOptions'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/sleep.mdx',
    module: 'workflow',
    values: ['sleep'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/fetch.mdx',
    module: 'workflow',
    values: ['fetch'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/fatal-error.mdx',
    module: 'workflow',
    values: ['FatalError'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/retryable-error.mdx',
    module: 'workflow',
    values: ['RetryableError'],
    types: ['RetryableErrorOptions'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/get-workflow-metadata.mdx',
    module: 'workflow',
    values: ['getWorkflowMetadata'],
    types: ['WorkflowMetadata'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/get-step-metadata.mdx',
    module: 'workflow',
    values: ['getStepMetadata'],
    types: ['StepMetadata'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow/define-hook.mdx',
    module: 'workflow',
    values: ['defineHook'],
    types: ['TypedHook'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/resume-hook.mdx',
    module: 'workflow/api',
    values: ['resumeHook'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/resume-webhook.mdx',
    module: 'workflow/api',
    values: ['resumeWebhook'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/get-hook-by-token.mdx',
    module: 'workflow/api',
    values: ['getHookByToken'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/start.mdx',
    module: 'workflow/api',
    values: ['Run', 'start'],
    types: ['StartOptions'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/get-run.mdx',
    module: 'workflow/api',
    values: ['Run', 'getRun'],
    types: [
      'StopSleepOptions',
      'StopSleepResult',
      'WorkflowReadableStream',
      'WorkflowReadableStreamOptions',
    ],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/get-world.mdx',
    module: 'workflow/runtime',
    values: ['getWorld'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/get-world.mdx',
    module: '@workflow/world',
    types: ['World'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-next/with-workflow.mdx',
    module: 'workflow/next',
    values: ['withWorkflow'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-ai/index.mdx',
    module: '@workflow/ai',
    values: ['WorkflowChatTransport'],
    types: ['ModelMessage'],
  },
  {
    file: 'docs/content/docs/api-reference/workflow-api/resume-hook.mdx',
    module: 'workflow/errors',
    values: ['HookNotFoundError'],
  },
];

const extraPublicModules = [
  '@workflow/ai',
  '@workflow/ai/agent',
  '@workflow/ai/anthropic',
  '@workflow/ai/gateway',
  '@workflow/ai/google',
  '@workflow/ai/openai',
  '@workflow/ai/xai',
  '@workflow/ai/test',
  '@workflow/next',
  '@workflow/utils/parse-name',
];

const publicModules = Array.from(
  new Set([
    ...documentedContracts.map((contract) => contract.module),
    ...extraPublicModules,
  ])
);

function readJson(relativePath: string): PackageJson {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
  );
}

function getPackageRoots(): Map<string, string> {
  return new Map(
    globSync(path.join(repoRoot, 'packages/*/package.json'))
      .map((packageJsonPath) => {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf-8')
        ) as PackageJson;
        if (!packageJson.name) return undefined;
        return [
          packageJson.name,
          path.relative(repoRoot, path.dirname(packageJsonPath)),
        ] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
  );
}

const packageRoots = getPackageRoots();

function splitPackageSpecifier(specifier: string): {
  packageName: string;
  subpath: string;
} {
  if (specifier.startsWith('@')) {
    const [scope, name, ...rest] = specifier.split('/');
    return {
      packageName: `${scope}/${name}`,
      subpath: rest.length === 0 ? '.' : `./${rest.join('/')}`,
    };
  }

  const [name, ...rest] = specifier.split('/');
  return {
    packageName: name,
    subpath: rest.length === 0 ? '.' : `./${rest.join('/')}`,
  };
}

function getExportEntry(packageJson: PackageJson, subpath: string): unknown {
  if (typeof packageJson.exports === 'string') {
    return subpath === '.' ? packageJson.exports : undefined;
  }
  return packageJson.exports?.[subpath];
}

function getExportTarget(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return undefined;

  const record = entry as Record<string, unknown>;
  for (const key of ['types', 'default', 'workflow', 'require']) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
}

function declarationCandidates(target: string): string[] {
  if (target.endsWith('.d.ts') || target.endsWith('.d.cts')) return [target];
  if (target.endsWith('.cjs')) return [target.replace(/\.cjs$/, '.d.cts')];
  if (target.endsWith('.js')) return [target.replace(/\.js$/, '.d.ts')];
  return [`${target}.d.ts`, path.join(target, 'index.d.ts')];
}

function modulePathMapping(specifier: string): string[] {
  const { packageName, subpath } = splitPackageSpecifier(specifier);
  const packageRoot = packageRoots.get(packageName);
  if (!packageRoot)
    throw new Error(`No package root configured for ${specifier}`);

  const packageJson = readJson(path.join(packageRoot, 'package.json'));
  const entry = getExportEntry(packageJson, subpath);
  const target = getExportTarget(entry);
  if (!target) throw new Error(`No export target for ${specifier}`);

  return declarationCandidates(target).map((candidate) =>
    path.join(repoRoot, packageRoot, candidate)
  );
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n'
      );
      if (!diagnostic.file || diagnostic.start === undefined) {
        return `TS${diagnostic.code}: ${message}`;
      }

      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start
      );
      return `${path.basename(diagnostic.file.fileName)}:${line + 1}:${
        character + 1
      } TS${diagnostic.code}: ${message}`;
    })
    .join('\n');
}

function compileVirtualContract(source: string): readonly ts.Diagnostic[] {
  const contractPath = path.join(repoRoot, '__api_reference_contract__.ts');
  const virtualFiles = new Map([[contractPath, source]]);

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,
    lib: [
      'lib.es2022.d.ts',
      'lib.dom.d.ts',
      'lib.dom.iterable.d.ts',
      'lib.dom.asynciterable.d.ts',
      'lib.esnext.disposable.d.ts',
    ],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    baseUrl: repoRoot,
    paths: Object.fromEntries(
      publicModules.map((specifier) => [
        specifier,
        modulePathMapping(specifier),
      ])
    ),
    types: ['node'],
    typeRoots: [
      path.join(__dirname, '../../node_modules/@types'),
      path.join(repoRoot, 'node_modules/@types'),
    ],
  };

  const defaultHost = ts.createCompilerHost(compilerOptions);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (fileName, languageVersion) => {
      const content = virtualFiles.get(fileName);
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      return defaultHost.getSourceFile(fileName, languageVersion);
    },
    fileExists: (fileName) =>
      virtualFiles.has(fileName) || defaultHost.fileExists(fileName),
    readFile: (fileName) =>
      virtualFiles.get(fileName) ?? defaultHost.readFile(fileName),
    getCurrentDirectory: () => repoRoot,
  };

  const program = ts.createProgram([contractPath], compilerOptions, host);
  return ts.getPreEmitDiagnostics(program);
}

describe('API reference public contract', () => {
  it('covers API reference files that exist', () => {
    for (const contract of documentedContracts) {
      expect(
        fs.existsSync(path.join(repoRoot, contract.file)),
        `${contract.file} should exist`
      ).toBe(true);
    }
  });

  it('documents import paths that exist in package exports and declaration output', () => {
    for (const specifier of publicModules) {
      const candidates = modulePathMapping(specifier);
      expect(
        candidates.some((candidate) => fs.existsSync(candidate)),
        `${specifier} should resolve to one of:\n${candidates.join('\n')}`
      ).toBe(true);
    }
  });

  it('documents symbols that are exported from their public modules', () => {
    const imports = documentedContracts
      .flatMap((contract, index) => {
        const values = (contract.values ?? []).map((exportName) => {
          const alias = `contract_${index}_${exportName}`;
          return `import { ${exportName} as ${alias} } from '${contract.module}';`;
        });
        const types = (contract.types ?? []).map((exportName) => {
          const alias = `contract_${index}_${exportName}`;
          return `import type { ${exportName} as ${alias} } from '${contract.module}';`;
        });
        return [...values, ...types];
      })
      .join('\n');

    const diagnostics = compileVirtualContract(imports);
    expect(formatDiagnostics(diagnostics)).toBe('');
  });

  it('preserves the high-risk API signatures described by the reference docs', () => {
    const source = `
      import { getHookByToken, resumeHook, resumeWebhook } from 'workflow/api';
      import { getWorld } from 'workflow/runtime';
      import { createWebhook, fetch, RetryableError, sleep } from 'workflow';
      import type { Hook, World } from '@workflow/world';

      declare const hook: Hook;

      const resumedFromToken: Promise<Hook> = resumeHook('token', { ok: true });
      const resumedFromHook: Promise<Hook> = resumeHook(hook, { ok: true });
      const lookedUpHook: Promise<Hook> = getHookByToken('token');
      const webhookResponse: Promise<Response> = resumeWebhook(
        'token',
        new Request('https://example.test')
      );

      async function manualWebhookCheck() {
        const request = await createWebhook({ respondWith: 'manual' });
        await request.respondWith(new Response('ok'));
      }

      async function sleepCheck() {
        await sleep('10s');
        await sleep(1000);
        await sleep(new Date(Date.now() + 1000));
      }

      const retryable = new RetryableError('retry', { retryAfter: '5s' });
      const retryAfter: Date = retryable.retryAfter;
      const worldPromise: Promise<World> = getWorld();
      const responsePromise: Promise<Response> = fetch('https://example.test');

      void manualWebhookCheck;
      void sleepCheck;
      void retryAfter;
      void worldPromise;
      void responsePromise;
      void resumedFromToken;
      void resumedFromHook;
      void lookedUpHook;
      void webhookResponse;
    `;

    const diagnostics = compileVirtualContract(source);
    expect(formatDiagnostics(diagnostics)).toBe('');
  });
});
