# Workflow DevKit Skills

Installable skills that guide users through creating durable workflows.
Inspired by [Impeccable](https://github.com/pbakaus/impeccable)'s teach-then-build model.

## Quick start: Review existing workflows

If you already have workflow code and want to inspect it before making changes:

| Command | What it does |
|---------|--------------|
| `/workflow-audit` | Review an existing workflow or design for determinism, retries, compensation, and test gaps |

## Quick start: Scenario commands

If you know what kind of workflow you need, start with a scenario command:

| Command | What it builds |
|---------|---------------|
| `/workflow-approval` | Approval with expiry, escalation, and deterministic hooks |
| `/workflow-webhook` | External webhook ingestion with duplicate handling and compensation |
| `/workflow-saga` | Partial-success side effects and compensation |
| `/workflow-timeout` | Correctness depends on sleep/wake-up behavior |
| `/workflow-idempotency` | Retries and replay can duplicate effects |
| `/workflow-observe` | Operators need progress streams and terminal signals |

Scenario commands reuse `.workflow.md` when present and fall back to a focused
context capture when not. They apply domain-specific guardrails and terminate
with the same `verification_plan_ready` contract as `/workflow-build`.

For workflows that don't fit a scenario command, use the manual two-stage loop below.

## Two-skill workflow (manual path)

| Stage | Skill | Purpose |
|-------|-------|---------|
| 1 | `workflow-teach` | One-time setup: scan repo, interview user, write `.workflow.md` |
| 2 | `workflow-build` | Build workflow code interactively, guided by `.workflow.md` context |

The `workflow` skill is an always-on API reference available at any point.

### User journey

```
workflow-teach         Stage 1 — capture project context → .workflow.md
       │
       ▼
workflow-build         Stage 2 — interactive build → TypeScript code + tests
```

### `.workflow.md`

Written by `workflow-teach`. A plain-English markdown file in the project root
containing project context, business rules, failure expectations, observability
needs, and approved patterns. Git-ignored since it's project-specific.

`workflow-build` reads this file to make informed decisions about step
boundaries, failure modes, idempotency strategies, and test coverage.

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

## Required frontmatter fields

Each `SKILL.md` must begin with YAML frontmatter containing:

| Field                | Type   | Required | Description                                           |
|----------------------|--------|----------|-------------------------------------------------------|
| `name`               | string | yes      | Kebab-case identifier (must match directory name)     |
| `description`        | string | yes      | When to trigger this skill; include trigger phrases    |
| `metadata.author`    | string | yes      | Authoring organization                                |
| `metadata.version`   | string | yes      | Semver-ish version string (bump on every change)      |

## Skill inventory

### Core surface (the two-stage loop)

| Skill              | Purpose                                         |
|--------------------|-------------------------------------------------|
| `workflow`         | Always-on API reference for writing workflows    |
| `workflow-teach`   | Stage 1 — capture project context into `.workflow.md` |
| `workflow-build`   | Stage 2 — build workflow code guided by context  |

### Scenario entrypoints (problem-first)

| Skill              | Purpose                                         |
|--------------------|-------------------------------------------------|
| `workflow-approval` | Approval with expiry, escalation, and deterministic hooks |
| `workflow-webhook`  | External webhook ingestion with duplicate handling and compensation |
| `workflow-saga`     | Multi-step side effects with explicit compensation |
| `workflow-timeout`  | Flows whose correctness depends on expiry and wake-up behavior |
| `workflow-idempotency` | Side effects that remain safe under retries, replay, and duplicate events |
| `workflow-observe`  | Operator-visible progress, stream namespaces, and terminal signals |

Scenario skills are user-invocable shortcuts that route into the teach → build
pipeline with domain-specific guardrails. They reuse `.workflow.md` when present
and fall back to a focused context capture when not.

### Review commands

| Skill              | Purpose                                         |
|--------------------|-------------------------------------------------|
| `workflow-audit`   | Review an existing workflow or design and recommend the best next skill |

### Optional helpers

| Skill              | Purpose                                         |
|--------------------|-------------------------------------------------|
| `workflow-init`    | First-time project setup before `workflow` is installed as a dependency |
| `workflow-audit`   | Review an existing workflow or design and recommend the best next skill |

## Persisted artifacts

The skill loop produces two categories of persisted artifacts:

**Skill-managed** — `.workflow.md` is written directly by `workflow-teach` and
read by `workflow-build`. This is the primary bridge between the two stages.

**Host-managed** — `.workflow-skills/*.json` files (context, blueprints,
verification plans) are managed by the host runtime or persistence layer —
not by the skill prompts themselves. The host extracts structured data from the skill
conversation and persists it for agent consumption. These machine-readable
artifacts survive across runs and allow agents to query correctness without
re-running the full skill loop.

## Golden scenarios

Golden files under `<skill>/goldens/` are curated edge-case examples:

### `workflow-teach/goldens/`

Interview scenarios showing expected `.workflow.md` output for different domains:
approval escalation, duplicate webhooks, observability streams, partial compensation.

### `workflow-build/goldens/`

Trap-catching demonstrations showing what the build skill flags and the correct
TypeScript code it produces: compensation sagas, child workflow handoffs,
rate-limit retry classification, approval timeout streaming, multi-event hook loops.

### `workflow-approval/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for approval workflows.

### `workflow-webhook/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for webhook ingestion workflows.

### `workflow-saga/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for saga workflows with explicit compensation.

### `workflow-timeout/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for timeout workflows with sleep/wake-up correctness.

### `workflow-idempotency/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for idempotency workflows with replay safety and duplicate handling.

### `workflow-observe/goldens/`

End-to-end scenario demonstrations showing the full user-invocable path from
prompt → context capture → design constraints → generated code/tests →
verification summary for observability workflows with namespaced streams and terminal signals.

## Validation

```bash
# Run the validator
node scripts/validate-workflow-skill-files.mjs

# Run the test suite
pnpm vitest run scripts/validate-workflow-skill-files.test.mjs
```

The validator checks that skill files and goldens contain required content,
avoid stale references, and maintain correct sequencing.
