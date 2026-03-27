# Workflow DevKit Skills

Installable skills that guide users through creating durable workflows.
Inspired by [Impeccable](https://github.com/pbakaus/impeccable)'s unified
skill-and-build model.

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

Example:

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

## Skill inventory

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
