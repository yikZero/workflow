# Feasibility Analysis: GitHub Actions Alternative Backed by Workflow DevKit

## Executive Summary

Building a GitHub Actions-compatible CI/CD runner backed by Workflow DevKit is **feasible for a meaningful POC**. The core execution model maps surprisingly well: GitHub Actions workflows are DAGs of jobs containing sequential steps — which aligns directly with Workflow's orchestrator-and-steps architecture. The event-sourced replay model provides durability, retries, and observability for free. The main gaps are around container/runner management (which is out-of-scope for the workflow engine itself) and some advanced GitHub Actions features that can be deferred.

This document covers the concept mapping, identifies gaps, and proposes a minimal POC scope.

---

## 1. Concept Mapping: GitHub Actions → Workflow DevKit

| GitHub Actions Concept | Workflow DevKit Equivalent | Notes |
|---|---|---|
| **Workflow file** (`.github/workflows/*.yml`) | Generated `"use workflow"` function | YAML is parsed and compiled into a Workflow function |
| **Job** | Top-level step or nested workflow | Each job becomes a step (or child workflow for isolation) |
| **Step** (`run:` / `uses:`) | `"use step"` function | Each step becomes a durable step with full Node.js access |
| **`needs:` (job dependencies)** | `await` ordering / `Promise.all` | Sequential `await` for deps, `Promise.all` for parallel jobs |
| **`if:` conditionals** | JavaScript `if` statements in workflow | Expression evaluation in the orchestrator |
| **`env:` variables** | `process.env` in step context | Workflow VM has frozen `process.env`; steps have full access |
| **`secrets`** | Environment variables / World config | Injected into step execution context |
| **`strategy.matrix`** | `Promise.all` over matrix combinations | Generate step invocations for each matrix entry |
| **`timeout-minutes`** | Step-level timeout (needs extension) | Not natively supported yet; would need to be added |
| **`continue-on-error`** | `try/catch` around step call | Workflow catches `FatalError` and continues |
| **`outputs`** | Step return values | Steps return values that flow into subsequent steps |
| **Retry (`RetryableError`)** | Native `RetryableError` with backoff | Built-in; more sophisticated than Actions' native retry |
| **`on:` triggers** | Hooks / Webhooks | `createWebhook()` for HTTP triggers; `createHook()` for event-driven |
| **Artifacts** | World storage / external storage step | Would need an artifact storage abstraction |
| **`services:`** | Pre-step setup (out of scope for engine) | Container orchestration is external to Workflow |
| **`runs-on:`** | Runner/executor selection (external) | Workflow doesn't manage compute; needs a runner layer |
| **Reusable workflows** | Child workflows via `start()` | `start(childWorkflow, args)` from within a step |
| **Caching** | External cache step | Would be a custom step implementation |

---

## 2. Architecture: How It Would Work

### 2.1 High-Level Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  .github/        │     │  YAML-to-Workflow │     │  Workflow DevKit    │
│  workflows/      │────▶│  Compiler         │────▶│  Runtime            │
│  ci.yml          │     │  (yaml → TS)      │     │  (execute, replay)  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                          │
                                                          ▼
                                                  ┌─────────────────┐
                                                  │  Step Executor   │
                                                  │  (shell commands,│
                                                  │   action runner) │
                                                  └─────────────────┘
```

### 2.2 YAML-to-Workflow Compiler

The core innovation is a **compiler that translates GitHub Actions YAML into Workflow DevKit TypeScript code**. This is a build-time transformation, not a runtime interpretation.

Given this YAML:

```yaml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: npm install
      - name: Run tests
        run: npm test
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: ./deploy.sh
        env:
          TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

The compiler generates:

```typescript
import { sleep } from 'workflow';

// Each shell step becomes a "use step" function
async function job_test_step_1_checkout() {
  'use step';
  // Execute: actions/checkout@v4 (clone repo)
  await exec('git', ['clone', ...]);
}

async function job_test_step_2_install(context: StepContext) {
  'use step';
  await exec('npm', ['install'], { cwd: context.workspace });
}

async function job_test_step_3_test(context: StepContext) {
  'use step';
  await exec('npm', ['test'], { cwd: context.workspace });
}

async function job_deploy_step_1_deploy(context: StepContext) {
  'use step';
  await exec('./deploy.sh', [], {
    cwd: context.workspace,
    env: { ...context.env, TOKEN: context.secrets.DEPLOY_TOKEN },
  });
}

// The workflow orchestrator
export async function ci_workflow(event: PushEvent) {
  'use workflow';

  // Job: test (no dependencies, runs first)
  const testContext = await job_test_step_1_checkout();
  await job_test_step_2_install(testContext);
  await job_test_step_3_test(testContext);

  // Job: deploy (needs: test)
  const deployContext = await job_deploy_step_1_deploy({
    ...testContext,
    secrets: getSecrets(),
  });

  return { test: 'success', deploy: 'success' };
}
```

### 2.3 Parallel Jobs

Jobs without `needs:` dependencies run in parallel, mapping directly to `Promise.all`:

```yaml
jobs:
  lint:
    steps: [...]
  test:
    steps: [...]
  build:
    needs: [lint, test]
    steps: [...]
```

Becomes:

```typescript
export async function ci_workflow() {
  'use workflow';

  // lint and test run in parallel
  const [lintResult, testResult] = await Promise.all([
    runJob_lint(),
    runJob_test(),
  ]);

  // build depends on both
  const buildResult = await runJob_build(lintResult, testResult);
}
```

### 2.4 Matrix Strategy

```yaml
strategy:
  matrix:
    node: [18, 20, 22]
    os: [ubuntu-latest, macos-latest]
```

Becomes:

```typescript
const matrix = [
  { node: 18, os: 'ubuntu-latest' },
  { node: 18, os: 'macos-latest' },
  { node: 20, os: 'ubuntu-latest' },
  // ...
];

const results = await Promise.all(
  matrix.map((entry) => runJob_test(entry))
);
```

This leverages Workflow's native parallel step execution.

### 2.5 Trigger System

| GitHub Actions Trigger | Implementation |
|---|---|
| `on: push` | Webhook endpoint that calls `start(workflow, [pushEvent])` |
| `on: pull_request` | Webhook endpoint for PR events |
| `on: schedule` | External cron that calls `start()` (or Workflow sleep loop) |
| `on: workflow_dispatch` | HTTP endpoint / UI button that calls `start()` |
| `on: repository_dispatch` | `createHook()` / `createWebhook()` for custom events |

---

## 3. What Maps Well (Strengths)

### 3.1 Durability and Replay
Workflow's event-sourced model means every step's result is persisted. If the CI runner crashes mid-pipeline, the workflow resumes from exactly where it left off — steps that already completed are replayed from the event log without re-execution. GitHub Actions doesn't offer this; a crashed runner means a full re-run.

### 3.2 Retry Semantics
Workflow's `RetryableError` with configurable backoff is more sophisticated than GitHub Actions' basic retry. Steps can signal whether failures are transient or permanent (`RetryableError` vs `FatalError`), and the retry delay can be customized per-attempt.

### 3.3 Parallel Execution
`Promise.all` and `Promise.race` for parallel jobs is natural and well-tested in Workflow. Matrix builds are just parallel step invocations.

### 3.4 Observability
The event log provides a complete audit trail of every step's input, output, timing, and retry history. This is richer than GitHub Actions' log-only approach.

### 3.5 Hooks and Webhooks
Manual approval gates (`on: workflow_dispatch`, environment protection rules) map to `createHook()` — suspend the workflow until a human approves, then resume.

### 3.6 Streaming
Workflow's `getWritable()` / `getReadable()` streams can pipe real-time step output (shell command stdout/stderr) to a UI, similar to GitHub Actions' live log streaming.

---

## 4. Gaps and Challenges

### 4.1 Runner/Container Management (Critical Gap)
**Impact: High | Effort: High**

GitHub Actions' `runs-on:` dispatches jobs to VMs or containers. Workflow DevKit has no concept of compute allocation — it assumes steps run in the same process/environment. A CI/CD system needs:

- Isolated execution environments (containers or VMs)
- Multiple runner types (Linux, macOS, Windows)
- Self-hosted runner support
- Workspace persistence within a job (steps share a filesystem)

**POC approach**: For the POC, run everything on the local machine (like `act` does). Steps execute shell commands via Node.js `child_process`. Container support can be added later.

### 4.2 Filesystem/Workspace Sharing Between Steps (Medium Gap)
**Impact: Medium | Effort: Low**

GitHub Actions steps within a job share a filesystem (`$GITHUB_WORKSPACE`). In Workflow, steps are independent functions with serialized inputs/outputs — there's no shared mutable filesystem by default.

**POC approach**: Pass a `workspacePath` through step context. Steps operate on a shared directory on the local filesystem. This works because POC steps run in the same process.

### 4.3 Actions Ecosystem (`uses:`) (Medium Gap)
**Impact: Medium | Effort: Medium**

`uses: actions/checkout@v4` references reusable action packages from the GitHub marketplace. Supporting this requires:

- Downloading action repositories
- Running JavaScript actions (Node.js) or Docker actions
- Handling `action.yml` metadata (inputs, outputs)

**POC approach**: Support a small set of built-in actions (`actions/checkout`, `actions/setup-node`, `actions/cache`). Custom `uses:` can be deferred.

### 4.4 Expression Evaluation (`${{ }}`) (Low-Medium Gap)
**Impact: Medium | Effort: Medium**

GitHub Actions expressions like `${{ secrets.TOKEN }}`, `${{ steps.build.outputs.artifact }}`, `${{ matrix.node }}` need an expression evaluator.

**POC approach**: Implement a simple expression evaluator that handles variable interpolation for `github.*`, `env.*`, `secrets.*`, `steps.*.outputs.*`, and `matrix.*` contexts. The full expression language (functions like `contains()`, `startsWith()`, etc.) can be deferred.

### 4.5 Artifact Upload/Download (Low Gap for POC)
**Impact: Low | Effort: Medium**

Artifacts in GitHub Actions are uploaded/downloaded between jobs. In Workflow, step return values handle data flow, but large binary artifacts need external storage.

**POC approach**: Use the local filesystem for artifacts. A proper implementation would use World storage or S3-compatible object storage.

### 4.6 Service Containers (Deferred)
**Impact: Low for POC | Effort: High**

`services:` in GitHub Actions spins up sidecar containers (Redis, Postgres, etc.). This requires Docker orchestration.

**POC approach**: Defer. Users can start services manually or use docker-compose alongside the runner.

### 4.7 Step Timeout (Minor Gap)
**Impact: Low | Effort: Low**

GitHub Actions supports `timeout-minutes` per step and job. Workflow doesn't have native step timeouts but this could be implemented with `Promise.race([step(), sleep(timeout)])` combined with cancellation.

**POC approach**: Wrap step execution with a timeout using `Promise.race`.

---

## 5. POC Scope: Minimum Viable Feature Set

### 5.1 What to Build

#### Component 1: YAML Parser & Compiler
- Parse GitHub Actions YAML files
- Generate Workflow DevKit TypeScript from YAML
- Support: `name`, `on` (push, pull_request, workflow_dispatch), `jobs`, `steps`, `needs`, `env`, `if` (basic), `strategy.matrix`

#### Component 2: Step Executor
- Execute `run:` steps as shell commands via `child_process`
- Capture stdout/stderr and stream to Workflow's streaming API
- Handle exit codes (non-zero = error)
- Support `env:` per-step
- Support `working-directory:`

#### Component 3: Built-in Actions
- `actions/checkout` — `git clone` the repository
- `actions/setup-node` — install/configure Node.js version (via `nvm` or similar)

#### Component 4: Expression Evaluator
- Interpolate `${{ env.VAR }}`, `${{ secrets.NAME }}`, `${{ matrix.key }}`
- Interpolate `${{ steps.id.outputs.name }}` (using step return values)
- Interpolate `${{ github.event_name }}`, `${{ github.ref }}`, etc.

#### Component 5: Trigger Layer
- CLI command: `workflow-ci run <yaml-file> [--event push]`
- Webhook endpoint: receive GitHub webhook payloads and start workflows

#### Component 6: Output & Reporting
- Stream step logs in real-time via Workflow's streaming
- Report job/step status (pass/fail/skip)
- Final summary with durations

### 5.2 What to Defer

- Container/VM isolation (`runs-on:` treated as metadata only)
- Docker-based actions (`uses:` with Docker)
- Full expression language (functions, type coercion)
- Artifacts (upload/download actions)
- Service containers
- Caching
- Concurrency controls
- Environment protection rules
- Reusable workflows / composite actions
- OIDC tokens
- Permissions

### 5.3 Example: POC Target YAML

The POC should be able to run this workflow end-to-end:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

env:
  NODE_ENV: test

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - name: Run tests
        run: npm test
        env:
          CI: true

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Verify build
        run: ls -la dist/

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: echo "Deploying..."
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

---

## 6. Technical Implementation Plan

### Phase 1: Core Engine (Week 1-2)

```
packages/
  actions-runner/
    src/
      parser/
        yaml.ts          # YAML → internal IR
        schema.ts         # Zod schemas for Actions YAML
      compiler/
        codegen.ts        # IR → Workflow DevKit TS
        expressions.ts    # ${{ }} expression evaluator
      executor/
        shell.ts          # run: command executor
        actions.ts        # uses: action runner
      context/
        github.ts         # github.* context
        secrets.ts        # secrets management
        env.ts            # environment variables
        matrix.ts         # matrix expansion
      index.ts            # Main entry point
```

### Phase 2: CLI Integration (Week 2)

```bash
# Parse and execute a GitHub Actions workflow locally
workflow actions run .github/workflows/ci.yml --event push

# Dry-run: show the generated workflow code
workflow actions compile .github/workflows/ci.yml

# List workflows
workflow actions list
```

### Phase 3: Webhook Integration (Week 3)

- HTTP endpoint that receives GitHub webhook events
- Routes events to the correct workflow based on `on:` triggers
- Integrates with Workflow's `createWebhook()` for async callbacks

---

## 7. Key Design Decisions

### 7.1 Compile-time vs Runtime Interpretation

**Recommendation: Compile-time generation.**

Compiling YAML to Workflow TypeScript at build time means:
- Full type safety for the generated code
- SWC plugin handles the workflow/step splitting automatically
- No runtime YAML parsing overhead
- Generated code is inspectable and debuggable

The alternative (runtime interpretation with a generic workflow that reads YAML) would lose the benefits of Workflow's compile-time optimizations and would require reimplementing step splitting logic.

### 7.2 Job-as-Step vs Job-as-Child-Workflow

**Recommendation: Job-as-Step for POC, Job-as-Child-Workflow for production.**

- **Job-as-Step**: Each job is a sequence of `"use step"` calls within the main workflow. Simpler, but all jobs share the same Workflow run.
- **Job-as-Child-Workflow**: Each job is a separate child workflow started via `start()`. Better isolation, independent event logs, but more complex.

For the POC, Job-as-Step is sufficient. The workflow function orchestrates job ordering, and each shell command is a durable step.

### 7.3 Workspace Strategy

**Recommendation: Temp directory per job, shared across steps within a job.**

Each job gets a temporary directory. The `workspace` path is passed through the step context. Steps within a job can read/write to this directory. Between jobs, only explicit outputs (step return values) transfer.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Expression language complexity | Medium | Medium | Start with variable interpolation only; add functions incrementally |
| Actions ecosystem compatibility | High | Medium | Support only built-in actions for POC; document limitations |
| Container isolation needed for real use | High | High | POC runs locally; production needs a container runtime integration |
| Performance vs GitHub Actions | Low | Low | Workflow's replay model adds minimal overhead for CI tasks |
| YAML edge cases | Medium | Low | Use a well-tested YAML parser; validate against JSON schema |
| Step output size limits | Low | Medium | Workflow serialization handles large payloads; stream for logs |

---

## 9. Advantages Over GitHub Actions

If built, this system would offer several advantages:

1. **Durability**: Crashed runners resume from last completed step, not from scratch
2. **Local-first**: Run CI workflows locally with the same engine (like `act` but with durable execution)
3. **Portable**: Not locked to GitHub infrastructure; runs anywhere Workflow DevKit runs
4. **Better retries**: Per-step retry with configurable backoff, transient vs permanent error distinction
5. **Observability**: Full event log with inputs/outputs for every step, not just logs
6. **Approval gates**: Native `createHook()` for human-in-the-loop approvals
7. **Streaming**: Real-time output streaming built into the framework
8. **Self-hosted simplicity**: No runner application to install; just a Workflow endpoint

---

## 10. Conclusion

The Workflow DevKit execution model is a strong fit for a GitHub Actions alternative. The DAG-of-jobs-with-sequential-steps model maps directly to Workflow's orchestrator-and-steps pattern. The event-sourced durability, built-in retries, parallel execution, and hook system provide a solid foundation that goes beyond what GitHub Actions offers natively.

The main effort is in three areas:
1. **YAML-to-TypeScript compiler** — parsing and code generation (~40% of effort)
2. **Shell command executor** — running `run:` commands as durable steps (~20% of effort)
3. **Expression evaluator and context** — `${{ }}` interpolation and GitHub/secrets/matrix contexts (~25% of effort)
4. **Built-in actions** — `checkout`, `setup-node`, etc. (~15% of effort)

A working POC that can execute the target YAML from Section 5.3 is achievable in approximately 3 weeks of focused work. The compile-time approach leverages the existing SWC plugin infrastructure, and the step executor is straightforward Node.js `child_process` work.

**Verdict: Feasible. Start with the YAML parser and a shell step executor, validate with a simple lint+test+build workflow, then iterate.**

---

## 11. Execution Environment: Where Do Jobs Run?

### 11.1 The Problem

GitHub Actions runs each job inside an isolated VM or container (`runs-on: ubuntu-latest`). Every step within a job shares that VM's filesystem, network, and installed tools. Between jobs, isolation is complete — no shared state except explicit artifacts/outputs.

Workflow DevKit steps currently run **in-process** within the same Node.js runtime that handles the queue message. There's no concept of "spin up a VM, run shell commands in it, tear it down." For a CI/CD system, we need:

1. **Isolation** — untrusted CI code (user's `run:` commands) must not compromise the orchestrator
2. **Full Linux environment** — CI steps run `apt-get install`, `docker build`, `npm install`, etc.
3. **Shared filesystem within a job** — steps within a job share `$GITHUB_WORKSPACE`
4. **Clean slate per job** — each job starts fresh (unless caching is used)

### 11.2 Vercel Sandbox as the Execution Backend

[Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) is a strong fit for this. It provides exactly the missing "runner" layer:

| Requirement | Vercel Sandbox Capability |
|---|---|
| Isolated execution | Firecracker microVMs — full process/filesystem/network isolation |
| Full Linux environment | Amazon Linux 2023 with `sudo` access |
| Shell command execution | `sandbox.runCommand({ cmd, args, cwd, env })` with exit codes and stdout/stderr |
| Filesystem operations | `sandbox.writeFiles()`, `sandbox.readFile()`, `sandbox.mkDir()` |
| Shared workspace within a job | All steps in a job run in the same sandbox instance |
| Clean slate per job | Each job creates a new `Sandbox.create()` instance |
| Fast startup | Millisecond-scale microVM startup |
| Snapshotting | `sandbox.snapshot()` to pre-bake dependencies (like GitHub Actions' cached runner images) |
| Networking | Configurable network policies; outbound access for `npm install`, `apt-get`, etc. |
| Resource control | 1-8 vCPUs, up to 16 GB RAM per sandbox |
| Timeout | Default 5 min, extendable up to 5 hours (Pro/Enterprise) |

### 11.3 Architecture: Sandbox-Backed Steps

The key insight is that **each Workflow step function becomes the bridge between the durable orchestrator and a Sandbox microVM**. The step function's body doesn't run the shell command directly — it creates (or reuses) a Sandbox and executes the command inside it.

```
┌─────────────────────────────────┐
│  Workflow Orchestrator (VM)     │  "use workflow" — deterministic,
│                                 │  event-sourced, runs on Vercel
│  const lint = await runStep(…)  │  Functions / local
│  const test = await runStep(…)  │
│  if (lint.ok && test.ok)        │
│    await runStep(deploy, …)     │
└──────────┬──────────────────────┘
           │ step invocation (queued)
           ▼
┌─────────────────────────────────┐
│  Step Handler (Node.js)         │  "use step" — full Node.js,
│                                 │  runs on Vercel Functions
│  const sandbox = await          │
│    Sandbox.create({ … })        │  Creates or reconnects to a
│  const result = await           │  Firecracker microVM
│    sandbox.runCommand(…)        │
│  return { exitCode, stdout }    │  Returns serializable result
└──────────┬──────────────────────┘
           │ @vercel/sandbox SDK
           ▼
┌─────────────────────────────────┐
│  Vercel Sandbox (microVM)       │  Isolated Amazon Linux 2023
│                                 │
│  $ npm install                  │  Full Linux, sudo, networking
│  $ npm test                     │  Shared filesystem within job
│  $ ./deploy.sh                  │
└─────────────────────────────────┘
```

### 11.4 Sandbox Lifecycle: One Per Job

Each **job** gets its own Sandbox. Steps within a job share the sandbox (and its filesystem). This mirrors GitHub Actions' model exactly.

```typescript
async function executeJob(
  jobDef: JobDefinition,
  context: WorkflowContext
) {
  'use step';

  // Create a fresh sandbox for this job
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    resources: { vcpus: 2 },
    timeout: ms('30m'),
  });

  try {
    // Clone the repo (equivalent to actions/checkout)
    await sandbox.runCommand({
      cmd: 'git',
      args: ['clone', context.repoUrl, '/vercel/sandbox/workspace'],
    });

    // Execute each step sequentially within the same sandbox
    const stepResults: StepResult[] = [];
    for (const step of jobDef.steps) {
      if (step.if && !evaluateExpression(step.if, context)) {
        stepResults.push({ name: step.name, status: 'skipped' });
        continue;
      }

      const result = await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', step.run],
        cwd: '/vercel/sandbox/workspace',
        env: { ...context.env, ...step.env },
        stdout: process.stdout,  // stream logs in real-time
        stderr: process.stderr,
      });

      if (result.exitCode !== 0) {
        if (step.continueOnError) {
          stepResults.push({ name: step.name, status: 'failed', exitCode: result.exitCode });
          continue;
        }
        throw new FatalError(
          `Step "${step.name}" failed with exit code ${result.exitCode}`
        );
      }

      stepResults.push({ name: step.name, status: 'success' });
    }

    return stepResults;
  } finally {
    await sandbox.shutdown();
  }
}
```

### 11.5 Snapshotting: Fast Starts with Pre-Baked Environments

Vercel Sandbox's snapshot feature is a game-changer for CI. Instead of installing dependencies from scratch on every job, you can:

1. **Create a base snapshot** with common tools pre-installed (Node.js, Python, Docker CLI, build-essential)
2. **Create per-project snapshots** after `npm install` to cache `node_modules`
3. **Boot from snapshot** — millisecond startup with dependencies already present

This is analogous to GitHub Actions' cached runner images, but more flexible:

```typescript
// One-time: create a snapshot with project dependencies
const setupSandbox = await Sandbox.create({ runtime: 'node24' });
await setupSandbox.runCommand({ cmd: 'git', args: ['clone', repoUrl, '/workspace'] });
await setupSandbox.runCommand({ cmd: 'npm', args: ['ci'], cwd: '/workspace' });
const snapshot = await setupSandbox.snapshot();
// snapshot.id can be stored and reused

// Per-job: boot from snapshot — deps are already installed
const jobSandbox = await Sandbox.create({
  snapshot: snapshot.id,
  resources: { vcpus: 4 },
});
// node_modules already present, skip npm install
await jobSandbox.runCommand({ cmd: 'npm', args: ['test'], cwd: '/workspace' });
```

### 11.6 Job-as-Step vs Step-as-Step: Granularity Decision

There are two viable approaches for how Sandbox maps to Workflow primitives:

#### Option A: Entire Job = Single Workflow Step (Recommended for POC)

Each job is one durable step. The step creates a sandbox, runs all shell commands sequentially, and returns the combined result.

**Pros:**
- Simpler — fewer events in the log, less serialization overhead
- Natural sandbox lifecycle — one sandbox per step, created/destroyed cleanly
- Matches the "steps share a filesystem" model of GitHub Actions
- If the step fails, Workflow retries the entire job (which may be desirable for CI)

**Cons:**
- No per-shell-command durability (if sandbox crashes mid-job, the whole job retries)
- Less granular observability in the Workflow event log

#### Option B: Each Shell Command = Separate Workflow Step

Each `run:` command is its own Workflow step. The sandbox is created once and its ID is passed between steps.

**Pros:**
- Per-command durability — if command 3/5 fails, commands 1-2 don't re-execute
- More granular observability

**Cons:**
- Sandbox must persist between steps (use `Sandbox.get(sandboxId)` to reconnect)
- Sandbox timeout must cover the entire job duration
- More complex state management (passing sandbox ID through step outputs)
- Higher serialization overhead

**Recommendation**: Start with **Option A** (Job = Step). For a CI/CD workload, retrying an entire job on failure is acceptable — it's what GitHub Actions does anyway. The Workflow event log still captures per-job outcomes, and within each step, you can log per-command results.

### 11.7 Do We Need Sandboxes? Can We Skip Them?

For a pure **local development** POC (like `act` for GitHub Actions), sandboxes are optional. Steps can run shell commands directly via `child_process.spawn()` on the local machine. This is useful for:

- Local development and testing
- Self-hosted runners where the user trusts the CI code
- Quick iteration without Vercel infrastructure

But for **production** or **multi-tenant** use, sandboxes are essential:

| Concern | Without Sandbox | With Vercel Sandbox |
|---|---|---|
| Security | CI code runs in the same process/machine — full access to host | Firecracker microVM isolation — no host access |
| Reproducibility | Depends on host machine state | Clean Amazon Linux 2023 every time |
| Resource limits | No enforcement | CPU/memory limits per sandbox |
| Cleanup | Manual; leftover files/processes | Sandbox destroyed after job |
| Networking | No isolation | Configurable network policies |

### 11.8 Cost Model

Vercel Sandbox pricing for CI workloads (Pro plan):

| Metric | Rate | Example (10-min CI job, 2 vCPUs) |
|---|---|---|
| Active CPU | $0.50/hr | ~$0.08 per job |
| Provisioned Memory | $0.10/GB-hr | ~$0.07 per job (4 GB) |
| Sandbox Creation | $0.60/million | Negligible |
| Network | $0.10/GB | ~$0.01 per job |
| **Total per job** | | **~$0.16** |

For comparison, GitHub Actions charges ~$0.008/min for Linux runners = $0.08 for a 10-min job. Vercel Sandbox is roughly 2x the cost, but includes better isolation, snapshot-based caching, and the durability benefits of Workflow underneath.

### 11.9 Hybrid Approach: Sandbox Optional

The best architecture supports both modes:

```typescript
interface StepExecutor {
  runCommand(cmd: string, args: string[], opts: RunOpts): Promise<CommandResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  cleanup(): Promise<void>;
}

// Production: Vercel Sandbox
class SandboxExecutor implements StepExecutor {
  private sandbox: Sandbox;
  async runCommand(cmd, args, opts) {
    return await this.sandbox.runCommand({ cmd, args, ...opts });
  }
}

// Local dev: direct shell execution
class LocalExecutor implements StepExecutor {
  async runCommand(cmd, args, opts) {
    return await execFile(cmd, args, opts);
  }
}
```

The Workflow step function uses whichever executor is configured, making the sandbox layer pluggable. This gives us:

- **Local mode**: `workflow actions run ci.yml` — runs on your machine via `child_process`
- **Cloud mode**: `workflow actions run ci.yml --sandbox` — runs in Vercel Sandbox microVMs
- **Production mode**: triggered by webhooks, always uses Sandbox for isolation

### 11.10 Updated Architecture Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
│ GitHub/Git   │     │ Trigger Layer    │     │ Workflow DevKit          │
│ Webhook      │────▶│ (HTTP endpoint)  │────▶│ Orchestrator             │
│ push event   │     │ start(workflow)  │     │ "use workflow"           │
└──────────────┘     └──────────────────┘     │                          │
                                               │ job_lint = runJob(…)     │
                                               │ job_test = runJob(…)     │
                                               │ Promise.all([lint,test]) │
                                               │ await runJob(deploy)     │
                                               └───────────┬──────────────┘
                                                           │
                                          ┌────────────────┼────────────────┐
                                          │                │                │
                                          ▼                ▼                ▼
                                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                                   │ Step: lint  │  │ Step: test │  │ Step:deploy│
                                   │ "use step"  │  │ "use step" │  │ "use step" │
                                   └──────┬──────┘  └──────┬─────┘  └──────┬─────┘
                                          │                │               │
                                          ▼                ▼               ▼
                                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                                   │ Sandbox A  │  │ Sandbox B  │  │ Sandbox C  │
                                   │ npm run    │  │ npm test   │  │ ./deploy   │
                                   │   lint     │  │ (node 18)  │  │            │
                                   │            │  │ npm test   │  │            │
                                   │            │  │ (node 20)  │  │            │
                                   └────────────┘  └────────────┘  └────────────┘
                                    Firecracker     Firecracker     Firecracker
                                    microVM         microVMs        microVM
```

### 11.11 Summary

| Question | Answer |
|---|---|
| Where do jobs run? | In Vercel Sandbox microVMs (production) or locally via `child_process` (dev) |
| Do we need sandboxes? | Yes for production/multi-tenant; optional for local dev |
| Can we use Vercel Sandbox? | Yes — it's an excellent fit. Provides isolation, full Linux, shell execution, snapshotting, and a TypeScript SDK |
| How does it integrate? | Each Workflow `"use step"` function creates a Sandbox, runs commands, returns results |
| What's the sandbox lifecycle? | One sandbox per job; steps within a job share it; destroyed after job completes |
| What about cost? | ~$0.16 per 10-min job (2 vCPUs); comparable to GitHub Actions |

---

## 12. DX for AI Agents: Rethinking the Interface

If the primary users of this CI system are AI agents — not humans clicking through a web UI — the entire developer experience needs to be reconsidered. GitHub Actions was designed for humans: YAML files you hand-edit, a web dashboard you stare at, log output you scroll through, manual approval buttons you click. Every one of these assumptions breaks when the user is an agent.

### 12.1 What Changes When the User Is an Agent

| Human DX | Agent DX | Why It Matters |
|---|---|---|
| Read YAML docs, write YAML by hand | Generate workflows programmatically from intent | Agents don't "learn" a config format — they need a well-typed API or a clear schema to generate against |
| Watch a dashboard for green/red | Poll structured status, react programmatically | Agents need machine-readable state, not colored circles |
| Scroll logs to find the error | Receive structured error objects with context | Agents can process 10,000 lines of logs but are better served by a parsed failure summary |
| Manually re-run failed jobs | Automatically retry with modified strategy | Agents can reason about *why* something failed and adapt |
| Click "approve" on deployment gates | Programmatic approval via API/hook | Agent-to-agent approval, policy-based auto-approval |
| Copy-paste from Stack Overflow to fix CI | Observe failure → modify code → re-trigger → verify, in one loop | The tight feedback loop is the killer feature |

### 12.2 Programmatic-First Workflow Definition

YAML is fine for portability (and we should keep it for GitHub Actions compatibility), but for agents the primary interface should be a **TypeScript SDK** for workflow definition. Agents generate code, not config.

```typescript
import { pipeline, job, step } from '@workflow/actions';

const ci = pipeline('ci', {
  trigger: ['push', 'pull_request'],

  jobs: {
    test: job({
      steps: [
        step.checkout(),
        step.setupNode({ version: 20 }),
        step.run('npm ci'),
        step.run('npm test', { env: { CI: 'true' } }),
      ],
    }),

    deploy: job({
      needs: ['test'],
      if: (ctx) => ctx.github.ref === 'refs/heads/main',
      steps: [
        step.checkout(),
        step.run('./deploy.sh', {
          env: { TOKEN: (ctx) => ctx.secrets.DEPLOY_TOKEN },
        }),
      ],
    }),
  },
});
```

This gives agents:
- **Type safety** — autocompletion and type errors instead of YAML schema violations
- **Composability** — reuse steps as functions, build abstractions
- **Conditional logic** — real JavaScript `if`/`else`, not string expression evaluation
- **Testability** — unit test pipeline definitions before running them

The SDK generates the same Workflow DevKit code underneath. YAML is an alternative input format that compiles to the same thing.

### 12.3 Structured Output: Machine-Readable Everything

GitHub Actions emits unstructured log lines. An agent-oriented system should return **structured results at every level**:

```typescript
// What an agent gets back from a CI run — not log text, but typed data
interface CIRunResult {
  status: 'success' | 'failed' | 'cancelled';
  duration: { total: number; perJob: Record<string, number> };

  jobs: Record<string, {
    status: 'success' | 'failed' | 'skipped';
    steps: Array<{
      name: string;
      status: 'success' | 'failed' | 'skipped';
      exitCode?: number;
      duration: number;
      outputs: Record<string, string>;
      // Structured failure info — not just "npm test failed"
      failure?: {
        type: 'test_failure' | 'build_error' | 'lint_error' | 'timeout' | 'unknown';
        summary: string;
        details: TestFailure[] | BuildError[] | LintViolation[];
        filesInvolved: string[];
        suggestedFix?: string;
      };
    }>;
  }>;
}
```

This maps well to Workflow's architecture. The event log already captures structured per-step data (`step_completed` with serialized results, `step_failed` with error + stack). The extension is having step executors **parse** common output formats (JUnit XML, TAP, ESLint JSON, TypeScript compiler output) into structured objects instead of returning raw text.

```typescript
async function runTestStep(sandbox: Sandbox, context: JobContext) {
  'use step';

  const result = await sandbox.runCommand({
    cmd: 'npm', args: ['test', '--', '--reporter=json'],
    cwd: '/workspace',
  });

  // Parse test output into structured data
  const testResults = parseJestJson(result.stdout());

  if (result.exitCode !== 0) {
    throw new FatalError('Tests failed', {
      // Structured failure data is serialized into the event log
      // and available to the agent via run.returnValue
      data: {
        type: 'test_failure',
        summary: `${testResults.numFailedTests} of ${testResults.numTotalTests} tests failed`,
        failedTests: testResults.testResults
          .filter(t => t.status === 'failed')
          .map(t => ({
            name: t.name,
            file: t.ancestorTitles.join(' > '),
            error: t.failureMessages[0],
          })),
      },
    });
  }

  return testResults;
}
```

### 12.4 The Tight Feedback Loop: Observe → Reason → Fix → Re-Run

The single biggest DX shift for agents is the **feedback loop speed**. A human's CI loop is:

```
edit code → git commit → git push → wait for CI → read logs → understand failure → edit code → ...
```

An agent's loop should be:

```
trigger run → observe structured result → reason about failure → fix code in sandbox → re-run in same sandbox → verify → commit only when green
```

This is where Workflow + Sandbox together unlock something GitHub Actions fundamentally cannot do. The Workflow step has a **live sandbox** and can iterate inside it:

```typescript
async function smartTestStep(sandbox: Sandbox, context: JobContext) {
  'use step';

  const result = await sandbox.runCommand({
    cmd: 'npm', args: ['test', '--reporter=json'],
    cwd: '/workspace',
  });

  if (result.exitCode === 0) {
    return { status: 'passed', attempts: 1 };
  }

  // Agent-oriented: return rich failure data so the calling agent
  // can decide what to do (fix code, adjust config, skip flaky tests, etc.)
  const failures = parseTestOutput(result.stdout());

  return {
    status: 'failed',
    attempts: 1,
    failures,
    // Sandbox is still alive — the agent can send follow-up commands
    sandboxId: sandbox.id,
  };
}
```

But the more powerful pattern is giving the agent **interactive access to the sandbox** via hooks. The workflow suspends and waits for the agent to send commands:

```typescript
export async function interactiveCi(repoUrl: string) {
  'use workflow';

  const sandbox = await createSandbox(repoUrl);
  const testResult = await runTests(sandbox);

  if (testResult.status === 'failed') {
    // Create a hook — the agent can send fix attempts
    const fixHook = createHook<FixAttempt>({
      token: `fix:${getWorkflowMetadata().workflowRunId}`,
      metadata: {
        failures: testResult.failures,
        sandboxId: testResult.sandboxId,
      },
    });

    // Wait for the agent to send a fix
    for await (const attempt of fixHook) {
      const retryResult = await applyFixAndRetest(sandbox, attempt);
      if (retryResult.status === 'passed') {
        fixHook.dispose();
        return { status: 'fixed', fix: attempt, results: retryResult };
      }
      // Loop continues — agent can try another fix
    }
  }

  return { status: testResult.status, results: testResult };
}
```

The calling agent's interaction:

```typescript
// Agent starts a CI run
const run = await start(interactiveCi, ['https://github.com/user/repo']);

// Wait for result or hook suspension
const status = await run.status;

// If the workflow suspended on the fix hook, the agent can send patches
await resumeHook(`fix:${run.runId}`, {
  type: 'patch',
  diff: '--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ ...',
});

// Wait for the final result
const result = await run.returnValue;
```

This is a **conversational CI loop** — the workflow stays alive, the sandbox stays warm, and the agent can iterate without the overhead of new commits, new pushes, and new CI runs.

### 12.5 Tool-Use Interface (MCP / Function Calling)

For AI agents using tool-use protocols (MCP, OpenAI function calling, Anthropic tool use), the CI system should expose itself as **callable tools**, not just an API:

```typescript
// MCP tool definitions the CI system would expose
const tools = [
  {
    name: 'ci_run',
    description: 'Start a CI pipeline for a repository',
    parameters: {
      repo: { type: 'string', description: 'Repository URL or path' },
      ref: { type: 'string', description: 'Git ref (branch, tag, SHA)' },
      workflow: { type: 'string', description: 'Workflow file path or name' },
    },
  },
  {
    name: 'ci_status',
    description: 'Get the current status of a CI run with structured results',
    parameters: {
      runId: { type: 'string' },
    },
  },
  {
    name: 'ci_logs',
    description: 'Get logs for a specific job/step in a CI run',
    parameters: {
      runId: { type: 'string' },
      job: { type: 'string', optional: true },
      step: { type: 'string', optional: true },
    },
  },
  {
    name: 'ci_fix_and_retry',
    description: 'Apply a code fix to the sandbox and re-run failed tests',
    parameters: {
      runId: { type: 'string' },
      patch: { type: 'string', description: 'Unified diff to apply' },
    },
  },
  {
    name: 'ci_sandbox_exec',
    description: 'Run an arbitrary command in the CI sandbox for debugging',
    parameters: {
      runId: { type: 'string' },
      command: { type: 'string' },
    },
  },
];
```

This lets an agent interact with CI the same way it interacts with any other tool — no special knowledge of YAML formats or web UIs needed. The agent says "run CI on this repo" and gets back structured results it can reason about.

### 12.6 Event Streaming for Real-Time Agent Observation

Instead of polling for results, agents should be able to **stream events** as they happen. Workflow's `getReadable()` API already supports this:

```typescript
const run = await start(ciWorkflow, [repoUrl]);

// Stream events in real-time — agent can react as each step completes
const reader = run.readable.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  // Agent receives typed events
  switch (value.type) {
    case 'step_started':
      // Agent knows which step is running
      break;
    case 'step_completed':
      // Agent can inspect results immediately
      break;
    case 'step_failed':
      // Agent can start reasoning about the fix before the full run completes
      break;
  }
}
```

This enables **early termination** — if the agent sees a critical failure in step 2, it can cancel the run and start fixing rather than waiting for all 10 steps to complete or fail.

### 12.7 Self-Describing Workflows: Schema as Context

Agents operate best when they have full context about what they're interacting with. Workflows should be **self-describing**:

```typescript
// An agent can inspect a workflow before running it
const meta = await getWorkflowSchema('ci');
// Returns:
{
  name: 'ci',
  triggers: ['push', 'pull_request'],
  inputs: [{ name: 'deploy_target', type: 'string', required: false }],
  jobs: {
    lint: { needs: [], steps: ['checkout', 'setup-node', 'npm ci', 'npm run lint'] },
    test: { needs: [], steps: ['checkout', 'setup-node', 'npm ci', 'npm test'] },
    deploy: { needs: ['lint', 'test'], conditional: 'refs/heads/main only' },
  },
  estimatedDuration: '8-12 minutes',
  lastRunStatus: 'failed',
  lastFailure: { job: 'test', step: 'npm test', type: 'test_failure' },
}
```

This metadata comes from Workflow's JSON manifest (already generated by the SWC plugin) combined with historical run data from the event log. An agent can use this to decide whether to run the full pipeline, skip certain jobs, or focus on the historically failing step.

### 12.8 Agent-to-Agent Approval Gates

GitHub Actions has environment protection rules where a human must click "approve." For agent users, this becomes agent-to-agent review:

```typescript
export async function deployWorkflow(env: string) {
  'use workflow';

  const buildResult = await runBuild();

  // Instead of a human approval button, create a hook for a review agent
  const reviewHook = createHook<ReviewDecision>({
    token: `deploy-review:${getWorkflowMetadata().workflowRunId}`,
    metadata: {
      environment: env,
      changes: buildResult.changelog,
      testResults: buildResult.testSummary,
      riskScore: buildResult.riskAssessment,
    },
  });

  // A review agent receives this hook, inspects the metadata,
  // runs its own checks, and responds with approve/reject
  const decision = await reviewHook;

  if (decision.approved) {
    return await runDeploy(env, buildResult);
  } else {
    return { status: 'rejected', reason: decision.reason };
  }
}
```

The review agent operates independently — it receives the hook metadata (which includes structured build results, changelogs, risk scores), runs its own analysis (maybe checking for security issues, performance regressions, or policy violations), and sends back a typed decision. No human in the loop unless the review agent escalates.

### 12.9 Diff-Aware Pipelines

Agents are good at understanding code changes. The CI system should provide **diff context** to every step, enabling intelligent behavior:

```typescript
async function smartLintStep(sandbox: Sandbox, context: JobContext) {
  'use step';

  // Only lint changed files — the agent cares about fast feedback
  const changedFiles = context.diff.files
    .filter(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));

  if (changedFiles.length === 0) {
    return { status: 'skipped', reason: 'no TypeScript files changed' };
  }

  const result = await sandbox.runCommand({
    cmd: 'npx',
    args: ['eslint', '--format=json', ...changedFiles.map(f => f.path)],
    cwd: '/workspace',
  });

  const violations = JSON.parse(result.stdout());

  // Only report violations on changed lines — agents can reason about this
  const relevantViolations = violations.filter(v =>
    context.diff.isLineChanged(v.filePath, v.line)
  );

  return {
    total: violations.length,
    relevant: relevantViolations.length,
    violations: relevantViolations,
  };
}
```

### 12.10 Idempotent Run-If-Changed

Agents trigger CI runs frequently — sometimes redundantly. The system should support **idempotent execution**:

```typescript
// Agent can say "ensure CI passes for this SHA" without worrying about duplicates
const run = await ensureCi({
  repo: 'user/repo',
  sha: 'abc123',
  workflow: 'ci',
  // If a run for this SHA already exists and passed, return it immediately
  // If it's running, attach to it. If it failed, optionally re-run.
  strategy: 'reuse-if-passed',
});
```

Workflow's `runId` and event log make this natural — check if a run exists for the given commit SHA, return the cached result if it passed, or create a new run if needed.

### 12.11 Summary: Agent-First DX Principles

| Principle | Implementation |
|---|---|
| **Structured over textual** | Every step returns typed objects, not log text. Errors include type, affected files, and suggested fixes. |
| **Programmatic over declarative** | TypeScript SDK as the primary interface; YAML as a compatibility layer. |
| **Interactive over batch** | Hooks enable conversational CI — agent sends patches, workflow retries in the same warm sandbox. |
| **Tool-use native** | Expose CI as MCP/function-calling tools that agents can discover and invoke. |
| **Streaming over polling** | Real-time event streams via `getReadable()` so agents can react mid-run. |
| **Self-describing** | Workflows expose their schema, history, and expected behavior as queryable metadata. |
| **Diff-aware** | Steps receive structured diff context and can scope work to changed files/lines. |
| **Idempotent** | "Ensure CI passes for SHA X" without duplicate runs. |
| **Agent-to-agent gates** | Approval hooks with structured metadata for review agents, not human click-to-approve. |
| **Tight feedback loops** | Observe failure → fix in sandbox → re-run → verify, all within a single workflow run. |

The key insight is that Workflow DevKit is already closer to this agent-oriented model than GitHub Actions is. The event log provides structured data. Hooks provide interactive suspension/resumption. Streaming provides real-time observation. The sandbox provides a persistent environment for iterative fixing. The missing piece is mostly a **presentation layer** — packaging these primitives into an agent-friendly interface with tool definitions, structured error parsing, and the "conversational CI" pattern using hooks.
