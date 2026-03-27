# Workflow DevKit Skills

Installable skills that guide users through creating durable workflows.
Inspired by [Impeccable](https://github.com/pbakaus/impeccable)'s teach-then-build model.

## Two-skill workflow

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

### Optional helpers

| Skill              | Purpose                                         |
|--------------------|-------------------------------------------------|
| `workflow-init`    | First-time project setup before `workflow` is installed as a dependency |

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

## Validation

```bash
# Run the validator
node scripts/validate-workflow-skill-files.mjs

# Run the test suite
pnpm vitest run scripts/validate-workflow-skill-files.test.mjs
```

The validator checks that skill files and goldens contain required content,
avoid stale references, and maintain correct sequencing.
