# Workflow DevKit Skills

Installable skills that guide users through creating durable workflows.
Inspired by [Impeccable](https://github.com/pbakaus/impeccable)'s unified
skill-and-build model.

## Quick start: pick a scenario

Start from the problem you are solving, not the underlying stages:

| Command | When to use | Example prompt | Emits |
|---------|-------------|----------------|-------|
| `/workflow-approval` | Human approval, expiry, or escalation | `refund approvals with escalation after 48h` | `.workflow-skills/blueprints/approval-expiry-escalation.json` |
| `/workflow-webhook` | External ingress and duplicate delivery risk | `ingest Stripe checkout completion safely` | `.workflow-skills/blueprints/webhook-ingress.json` |
| `/workflow-saga` | Partial-success side effects and compensation | `reserve inventory, charge payment, compensate on shipping failure` | `.workflow-skills/blueprints/compensation-saga.json` |
| `/workflow-timeout` | Correctness depends on sleep/wake-up behavior | `wait 24h for approval, then expire` | `.workflow-skills/blueprints/approval-timeout-streaming.json` |
| `/workflow-idempotency` | Retries and replay can duplicate effects | `make duplicate webhook delivery safe` | `.workflow-skills/blueprints/duplicate-webhook-order.json` |
| `/workflow-observe` | Operators need progress streams and terminal signals | `stream operator progress and final status` | `.workflow-skills/blueprints/operator-observability-streams.json` |

Shared artifact across all scenario commands: `.workflow-skills/context.json`.
The `Emits` column above shows the primary persisted blueprint artifact for each
scenario. The full loop is:

- `workflow-teach` → create or reuse `.workflow-skills/context.json`
- `workflow-design` → create `.workflow-skills/blueprints/<name>.json`
- `workflow-stress` → patch that blueprint file in place
- `workflow-verify` → generate test matrix + integration skeleton in assistant output

Each scenario command reads your project context, emits a blueprint, stress-tests
it, and generates a verification matrix — without requiring you to learn the
underlying four-stage model first.

If your workflow doesn't fit a named scenario, run the four stages individually:
`/workflow-teach` → `/workflow-design` → `/workflow-stress` → `/workflow-verify`.

## Source-of-truth layout

```
skills/
├── README.md                          # this file
├── <skill-name>/
│   ├── SKILL.md                       # skill source (YAML frontmatter + markdown)
│   └── goldens/                       # optional golden scenarios
│       └── <scenario>.md
```

Every skill lives in its own directory under `skills/`. The **only**
authoritative copy of each skill is the `SKILL.md` file inside that directory.
Provider-specific bundles are **generated** into `dist/workflow-skills/` at
build time and must never be hand-edited.

## Required frontmatter fields

Each `SKILL.md` must begin with YAML frontmatter containing:

| Field                | Type   | Required | Description                                           |
|----------------------|--------|----------|-------------------------------------------------------|
| `name`               | string | yes      | Kebab-case identifier (must match directory name)     |
| `description`        | string | yes      | When to trigger this skill; include trigger phrases    |
| `metadata.author`    | string | yes      | Authoring organization                                |
| `metadata.version`   | string | yes      | Semver-ish version string (bump on every change)      |

### Optional frontmatter fields (scenario skills)

| Field                    | Type    | Required | Description                                              |
|--------------------------|---------|----------|----------------------------------------------------------|
| `user-invocable`         | boolean | no       | **Validated.** When `true`, the skill is a user-facing command. The builder enforces that scenario skills set this to `true`. |
| `argument-hint`          | string  | no       | **Validated.** Freeform hint shown after the command name (e.g. `"[flow or domain]"`). Required when `user-invocable` is `true`. |

**Decision (2026-03-27):** `user-invocable` and `argument-hint` are validated
by the builder and check pipeline. Scenario skills (`workflow-approval`,
`workflow-webhook`, `workflow-saga`, `workflow-timeout`,
`workflow-idempotency`, `workflow-observe`) must set `user-invocable: true`
and provide an `argument-hint`. Stage skills (`workflow-teach`,
`workflow-design`, `workflow-stress`, `workflow-verify`) may omit both fields.

Example (stage skill):

```yaml
---
name: workflow-teach
description: >-
  One-time setup that captures project context for workflow design skills.
  Triggers on "teach workflow", "set up workflow context", or "workflow-teach".
metadata:
  author: Vercel Inc.
  version: '0.5'
---
```

Example (scenario skill):

```yaml
---
name: workflow-approval
description: >-
  Design approval workflows with expiry, escalation, idempotency, and
  operator observability. Triggers on "approval workflow", "workflow-approval".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---
```

## Skill inventory

### Stage skills (the four-stage loop)

| Skill              | Purpose                                         | Stage |
|--------------------|-------------------------------------------------|-------|
| `workflow-init`    | Install and configure Workflow DevKit            | setup |
| `workflow`         | Core API reference for writing workflows         | ref   |
| `workflow-teach`   | Capture project context (interview-driven)       | 1     |
| `workflow-design`  | Emit a machine-readable WorkflowBlueprint        | 2     |
| `workflow-stress`  | Pressure-test blueprints for edge cases          | 3     |
| `workflow-verify`  | Generate implementation-ready test matrices      | 4     |

The four-stage loop (teach → design → stress → verify) is the primary user
journey. `workflow-init` is a prerequisite, and `workflow` is an always-on
reference.

### Scenario skills (problem-shaped entry points)

Scenario skills let users start from the problem instead of the stage. Each
scenario routes through the full teach → design → stress → verify loop
automatically.

| Skill                    | Purpose                                                       | Blueprint name                |
|--------------------------|---------------------------------------------------------------|-------------------------------|
| `workflow-approval`      | Human approval with expiry, escalation, operator signals      | `approval-expiry-escalation`  |
| `workflow-webhook`       | External ingress surviving duplicate delivery                 | `webhook-ingress`             |
| `workflow-saga`          | Multi-step side effects with explicit compensation            | `compensation-saga`           |
| `workflow-timeout`       | Flows whose correctness depends on expiry and wake-up         | `approval-timeout-streaming`  |
| `workflow-idempotency`   | Side effects safe under retries, replay, duplicate events     | `duplicate-webhook-order`     |
| `workflow-observe`       | Operator progress streams and terminal signals                | `operator-observability-streams` |

The full scenario registry is defined in `lib/ai/workflow-scenarios.ts`.

## Choosing a command

Start from the problem, not the stage:

- Use `/workflow-approval` for human approval, expiry, or escalation.
- Use `/workflow-webhook` for external ingress and duplicate delivery risk.
- Use `/workflow-saga` for partial-success side effects and compensation.
- Use `/workflow-timeout` when correctness depends on sleep/wake-up behavior.
- Use `/workflow-idempotency` when retries and replay can duplicate effects.
- Use `/workflow-observe` when operators need progress streams and terminal signals.

Each scenario command reads your project context, emits a blueprint, stress-tests
it, and generates a verification matrix — without requiring you to learn the
underlying four-stage model first.

## User journey

```
workflow-init          (one-time setup)
       │
       ▼
workflow-teach         Stage 1 — capture project context → .workflow-skills/context.json
       │
       ▼
workflow-design        Stage 2 — emit WorkflowBlueprint → .workflow-skills/blueprints/<name>.json
       │
       ▼
workflow-stress        Stage 3 — pressure-test, patch blueprint in-place
       │
       ▼
workflow-verify        Stage 4 — generate test matrices, skeletons, runtime commands
```

Each skill reads the artifacts produced by the previous stage. The `workflow`
skill is an always-on API reference available at any point.

## Persistence contract

The skill loop persists two types of artifacts on disk. Both paths are
git-ignored so they stay local to each developer's checkout.

### Contract version

All persisted JSON files include a `contractVersion` field (currently `"1"`).
When the schema changes in a backward-incompatible way, this value is bumped.
Downstream skills and tooling check this field before reading to avoid
misinterpreting old data.

### `.workflow-skills/context.json`

Written by `workflow-teach` (stage 1). Contains the project context gathered
from repo inspection and user interview. Shape defined by the `WorkflowContext`
type in `lib/ai/workflow-blueprint.ts`.

Key fields: `contractVersion`, `projectName`, `productGoal`,
`triggerSurfaces`, `externalSystems`, `antiPatterns`, `canonicalExamples`,
`businessInvariants`, `idempotencyRequirements`, `approvalRules`,
`timeoutRules`, `compensationRules`, `observabilityRequirements`,
`openQuestions`.

### `.workflow-skills/blueprints/<name>.json`

Written by `workflow-design` (stage 2), patched in-place by `workflow-stress`
(stage 3). Contains a single `WorkflowBlueprint` object as defined in
`lib/ai/workflow-blueprint.ts`.

Required policy arrays: `invariants`, `compensationPlan`, `operatorSignals`.

### Backward compatibility

- Prompt changes that do not alter the JSON shape require no version bump.
- Adding optional fields is backward-compatible (no version bump).
- Removing or renaming fields, or changing semantics, requires bumping
  `contractVersion` and updating all four skills to handle migration.

## First-wave provider targets

The build system generates bundles for these providers:

| Provider      | Output directory                          | Format                            |
|---------------|-------------------------------------------|-----------------------------------|
| Claude Code   | `dist/workflow-skills/claude-code/.claude/skills/` | directory of `SKILL.md` files |
| Cursor        | `dist/workflow-skills/cursor/.cursor/skills/`      | directory of `SKILL.md` files |

Additional providers (OpenCode, Pi, Gemini CLI, Codex CLI) can be added by
extending the provider map in `scripts/build-workflow-skills.mjs`.

## Generated `dist/` layout

```
dist/workflow-skills/
├── manifest.json                    # build manifest (checksums, versions)
├── claude-code/
│   └── .claude/
│       └── skills/
│           ├── workflow-init/SKILL.md
│           ├── workflow/SKILL.md
│           ├── workflow-teach/SKILL.md
│           ├── workflow-design/SKILL.md
│           ├── workflow-stress/SKILL.md
│           └── workflow-verify/SKILL.md
└── cursor/
    └── .cursor/
        └── skills/
            ├── workflow-init/SKILL.md
            ├── workflow/SKILL.md
            ├── workflow-teach/SKILL.md
            ├── workflow-design/SKILL.md
            ├── workflow-stress/SKILL.md
            └── workflow-verify/SKILL.md
```

## Commit policy

Generated `dist/workflow-skills/` artifacts are **git-ignored**. They are
built fresh in CI and as part of the release workflow. Only `skills/` source
files are committed.

## Build commands

```bash
# Build provider bundles
pnpm build:workflow-skills

# Check mode (dry run, exits 0 if source is valid)
node scripts/build-workflow-skills.mjs --check
```

## Golden scenarios

Golden files under `<skill>/goldens/` are curated edge-case examples that
exercise the hardest workflow patterns: compensation sagas, webhook
idempotency, approval timeouts, child workflow handoffs, and more. They are
bundled alongside their parent skill in every provider output.
