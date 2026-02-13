import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CANARY_PATH_PATTERNS = [
  /^packages\/next(?:\/|$)/,
  /^workbench\/nextjs-[^/]+(?:\/|$)/,
];

function parseChangedFiles(rawValue) {
  if (!rawValue?.trim()) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (file) => typeof file === 'string' && file.length > 0
      );
    }
  } catch {
    // Fallback to line/comma-separated parsing below.
  }

  return rawValue
    .split(/\r?\n|,/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function readChangedFilesFromEnv() {
  const rawChangedFiles =
    process.env.CHANGED_FILES ?? process.env.GITHUB_CHANGED_FILES;
  if (!rawChangedFiles) return null;

  return parseChangedFiles(rawChangedFiles);
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    ...options,
  }).trim();
}

function hasCommit(commitSha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commitSha}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function ensureCommit(commitSha) {
  if (!commitSha || hasCommit(commitSha)) return;

  execFileSync(
    'git',
    ['fetch', '--no-tags', '--depth=1', 'origin', commitSha],
    {
      stdio: 'ignore',
    }
  );
}

function readChangedFilesFromGitHubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const baseSha = event?.pull_request?.base?.sha;
    const headSha = event?.pull_request?.head?.sha;
    if (!baseSha || !headSha) return null;

    ensureCommit(baseSha);
    ensureCommit(headSha);

    // Compare base/head snapshots directly so PR-level changes are detected
    // even in shallow checkouts where merge-base can be unavailable.
    const output = runGit(['diff', '--name-only', baseSha, headSha]);
    if (!output) return [];

    return output.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function readChangedFilesFromHead() {
  try {
    const output = runGit(['diff', '--name-only', 'HEAD~1...HEAD']);
    if (!output) return [];

    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function getChangedFiles() {
  return (
    readChangedFilesFromEnv() ??
    readChangedFilesFromGitHubEvent() ??
    readChangedFilesFromHead()
  );
}

function shouldRunCanaryTests() {
  if (process.env.GITHUB_REF === 'refs/heads/main') return true;

  const changedFiles = getChangedFiles();
  return changedFiles.some((file) =>
    CANARY_PATH_PATTERNS.some((pattern) => pattern.test(file))
  );
}

// Framework-specific dev test configurations
const DEV_TEST_CONFIGS = {
  'nextjs-turbopack': {
    generatedStepPath: 'app/.well-known/workflow/v1/step/route.js',
    generatedWorkflowPath: 'app/.well-known/workflow/v1/flow/route.js',
    apiFilePath: 'app/api/chat/route.ts',
    apiFileImportPath: '../../..',
  },
  'nextjs-webpack': {
    generatedStepPath: 'app/.well-known/workflow/v1/step/route.js',
    generatedWorkflowPath: 'app/.well-known/workflow/v1/flow/route.js',
    apiFilePath: 'app/api/chat/route.ts',
    apiFileImportPath: '../../..',
  },
  nitro: {
    generatedStepPath: 'node_modules/.nitro/workflow/steps.mjs',
    generatedWorkflowPath: 'node_modules/.nitro/workflow/workflows.mjs',
    apiFilePath: 'routes/api/chat.post.ts',
    apiFileImportPath: '../..',
  },
  nuxt: {
    generatedStepPath: '.nuxt/workflow/steps.mjs',
    generatedWorkflowPath: '.nuxt/workflow/workflows.mjs',
    apiFilePath: 'server/api/chat.post.ts',
    apiFileImportPath: '../..',
  },
  sveltekit: {
    generatedStepPath: 'src/routes/.well-known/workflow/v1/step/+server.js',
    generatedWorkflowPath: 'src/routes/.well-known/workflow/v1/flow/+server.js',
    apiFilePath: 'src/routes/api/chat/+server.ts',
    apiFileImportPath: '../../../..',
    workflowsDir: 'src/workflows',
  },
  vite: {
    generatedStepPath: 'node_modules/.nitro/workflow/steps.mjs',
    generatedWorkflowPath: 'node_modules/.nitro/workflow/workflows.mjs',
    apiFilePath: 'routes/api/chat.post.ts',
    apiFileImportPath: '../..',
  },
  hono: {
    generatedStepPath: 'node_modules/.nitro/workflow/steps.mjs',
    generatedWorkflowPath: 'node_modules/.nitro/workflow/workflows.mjs',
    apiFilePath: './src/index.ts',
    apiFileImportPath: '..',
  },
  express: {
    generatedStepPath: 'node_modules/.nitro/workflow/steps.mjs',
    generatedWorkflowPath: 'node_modules/.nitro/workflow/workflows.mjs',
    apiFilePath: './src/index.ts',
    apiFileImportPath: '..',
  },
  fastify: {
    generatedStepPath: 'node_modules/.nitro/workflow/steps.mjs',
    generatedWorkflowPath: 'node_modules/.nitro/workflow/workflows.mjs',
    apiFilePath: './src/index.ts',
    apiFileImportPath: '..',
  },
  nest: {
    generatedStepPath: '.nestjs/workflow/steps.mjs',
    generatedWorkflowPath: '.nestjs/workflow/workflows.mjs',
    apiFilePath: './src/app.controller.ts',
    apiFileImportPath: '..',
    workflowsDir: 'src/workflows',
  },
  astro: {
    generatedStepPath: 'src/pages/.well-known/workflow/v1/step.js',
    generatedWorkflowPath: 'src/pages/.well-known/workflow/v1/flow.js',
    apiFilePath: 'src/pages/api/chat.ts',
    apiFileImportPath: '../..',
    workflowsDir: 'src/workflows',
  },
};

const matrix = {
  app: [
    {
      name: 'nextjs-turbopack',
      project: 'example-nextjs-workflow-turbopack',
      ...DEV_TEST_CONFIGS['nextjs-turbopack'],
    },
    {
      name: 'nextjs-webpack',
      project: 'example-nextjs-workflow-webpack',
      ...DEV_TEST_CONFIGS['nextjs-webpack'],
    },
  ],
};

if (shouldRunCanaryTests()) {
  const newItems = [];

  for (const item of matrix.app) {
    newItems.push({ ...item, canary: true });
  }
  matrix.app.push(...newItems);
}

// Manually add nitro
matrix.app.push({
  name: 'nitro',
  project: 'workbench-nitro-workflow',
  ...DEV_TEST_CONFIGS.nitro,
});

matrix.app.push({
  name: 'sveltekit',
  project: 'workbench-sveltekit-workflow',
  ...DEV_TEST_CONFIGS.sveltekit,
});

matrix.app.push({
  name: 'nuxt',
  project: 'workbench-nuxt-workflow',
  ...DEV_TEST_CONFIGS.nuxt,
});

matrix.app.push({
  name: 'hono',
  project: 'workbench-hono-workflow',
  ...DEV_TEST_CONFIGS.hono,
});

matrix.app.push({
  name: 'vite',
  project: 'workbench-vite-workflow',
  ...DEV_TEST_CONFIGS.vite,
});

matrix.app.push({
  name: 'express',
  project: 'workbench-express-workflow',
  ...DEV_TEST_CONFIGS.express,
});

matrix.app.push({
  name: 'fastify',
  project: 'workbench-fastify-workflow',
  ...DEV_TEST_CONFIGS.fastify,
});

matrix.app.push({
  name: 'nest',
  project: 'workbench-nest-workflow',
  ...DEV_TEST_CONFIGS.nest,
});

matrix.app.push({
  name: 'astro',
  project: 'workbench-astro-workflow',
  ...DEV_TEST_CONFIGS.astro,
});

console.log(JSON.stringify(matrix));
