---
name: vercel-toolbar
description: List or check Vercel toolbar comments for a project. Use when the user wants to see their Vercel comments, toolbar comments, or feedback on deployments; or when they ask if there's feedback or comments on their preview, deployment, or branch.
---

# Vercel Toolbar Comments

Fetch and filter Vercel toolbar (deployment) comments for a team and optionally by project, branch, page, or search. Uses the Vercel CLI (`vercel` or `vc`); most users already have it installed and authenticated.

## Setup (For Agents)

**Try the operation first** — call `vc api` (or `vercel api`) directly. Assume the CLI is installed and the user is logged in.

**Only if it fails:**
- **CLI not found** (e.g. `vercel cli not found` or command not found) → Tell the user to install: run `bash ~/.claude/skills/vercel-toolbar/scripts/install.sh` (or `npm install -g vercel`) in their terminal.
- **Not authenticated** (e.g. `not authenticated`, login required, or 401) → Tell the user to log in: run the install script or `vercel login` in their terminal.

Then they can retry. Do not run the install script for the user.

Optional: To check readiness without calling the API, run `bash ~/.claude/skills/vercel-toolbar/scripts/check-install.sh`. It outputs `ok` or the reason (cli not found / not authenticated). You do not need to run this before every request.

### Optional: Whitelist the Command

To avoid permission prompts when calling the CLI:

```json
{
  "permissions": {
    "allow": [
      "Bash(vc *)",
      "Bash(vercel *)"
    ]
  }
}
```

## Resolving teamId

Every request needs a **teamId** (Vercel org/team). Resolve it in this order:

1. **From the repo**  
   Look for `.vercel/repo.json` at the repo root. It has an `orgId` field — use that as `teamId`.

2. **From project config**  
   Look for `.vercel/project.json` (may be in the repo root or in subdirectories; monorepos can have several). Each has an `orgId` — use that as `teamId`. Prefer the one for the project the user cares about.

3. **Ask the user**  
   If neither file is present or you cannot infer the team, ask which team to use. They can give a **team id** or **team slug**; both work for `teamId` and for `--scope`.

For all subsequent commands you must pass this id as:
- The `teamId` query parameter in the API URL
- The `--scope {teamId}` CLI flag

## Resolving projects (optional)

To limit results to one or more projects:

- **With `.vercel/repo.json`**  
  It may have a `projects` field: `{ id: string; name: string; directory: string }[]`. Use `id` for the project(s) the user cares about.

- **With `.vercel/project.json`**  
  Each file has a `projectId` field. Use it for that project.

Pass these as one or more `projectId` query params (multiple values allowed).

## Branch (optional)

If the user wants comments for a specific branch:

- Use git to get the current branch, e.g. `git branch --show-current`, or use the branch they specify.
- Pass it as the `branch` query param.

## Status: use unresolved unless the user says otherwise

**Default to `status=unresolved`.** When the user asks for feedback, comments, or toolbar comments (on their preview, deployment, or branch), they mean comments that are still open — i.e. **unresolved**. Always pass `status=unresolved` in that case.

**Only use something else when the user explicitly asks for it:**
- Use `status=resolved` (or omit `status` and pass no status filter) only when they specifically ask for **resolved**, **addressed**, or **closed** comments.
- If they ask for "all" comments (both open and closed), omit the status param or use whatever the API supports for "all".

So: no mention of resolved/addressed/closed → use `status=unresolved`.

## Calling the API

Call the CLI yourself — do not use a script. Steps:

1. **Resolve teamId** using the rules above (from `.vercel/repo.json` or `.vercel/project.json`, or ask the user).
2. **Build the query string** with the params below. Always include `teamId` and `status=unresolved` unless the user explicitly asked for resolved/addressed/closed comments.
3. **Run:**

```bash
vc api "/toolbar/comments?teamId={teamId}&status=unresolved&limit=20" --scope {teamId}
```

Use `vercel` instead of `vc` if that’s what’s installed. Add any optional query params to the URL (see table below). For multiple values (e.g. several projects or pages), repeat the param: `projectId=prj_1&projectId=prj_2` or `page=/docs&page=/about`.

**Examples:**

```bash
# Basic: unresolved comments for the team (teamId from .vercel)
vc api "/toolbar/comments?teamId=team_xxx&status=unresolved&limit=20" --scope team_xxx

# With project and branch
vc api "/toolbar/comments?teamId=team_xxx&status=unresolved&projectId=prj_yyy&branch=main&limit=20" --scope team_xxx

# With page filter and search (user asked for feedback on /docs)
vc api "/toolbar/comments?teamId=team_xxx&status=unresolved&page=/docs&search=typo&limit=20" --scope team_xxx

# All comments (user explicitly asked for resolved/closed)
vc api "/toolbar/comments?teamId=team_xxx&limit=20" --scope team_xxx

# Pagination
vc api "/toolbar/comments?teamId=team_xxx&status=unresolved&limit=50&offset=20" --scope team_xxx
```

**Important:** The value for `--scope` must match the `teamId` in the URL (team id or slug).

## Query params reference

| Param      | Description |
|-----------|-------------|
| teamId    | Required. From `.vercel` config or user. |
| status    | Use `unresolved` by default. Use `resolved` or omit for all only when the user explicitly asks for resolved, addressed, or closed comments. |
| projectId | Optional. Filter by project(s). Multiple allowed. |
| branch    | Optional. Filter by branch name. |
| page      | Optional. Exact path (e.g. `/docs`) or glob (e.g. `/docs*`). Multiple allowed. |
| search    | Optional. Only comments containing this text. |
| limit     | Optional. Default 20. |
| offset    | Optional. For pagination. |

## Output

The `vc api` command returns the API response as JSON to stdout. Use it to list comments and their metadata. Errors (e.g. CLI missing, not authenticated, or API errors) go to stderr or the response body.

## Present Results to User

When presenting toolbar comments:

1. **Summarize**: e.g. "Found 5 unresolved toolbar comments."
2. **Group meaningfully**: by project, branch, or page if relevant.
3. **Include links**: deployment URLs or comment links when the API provides them.
4. **Suggest actions**: e.g. "Say which project or branch to filter by, or ask to show resolved comments."

Example:

```markdown
## Vercel Toolbar Comments

**Team:** my-team · **Status:** Unresolved

| Page   | Preview        | Deployment |
|--------|----------------|------------|
| /docs  | "Fix typo here" | [View](…)  |

5 comments total. I can filter by project, branch, or show resolved comments if you want.
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|--------|----------|
| `vercel cli not found` | CLI not installed | Run the skill install script or `npm install -g vercel` |
| `not authenticated` | Not logged in | Run install script or `vercel login` in terminal |
| Could not find teamId | No `.vercel` config | Add `--team-id <id or slug>` or ask user for team |
| 403 / auth errors | Wrong scope or token | Ensure `--scope` matches `teamId` and user has access to that team |
| Empty or wrong projects | Wrong projectId | Check `.vercel/repo.json` `projects` or `.vercel/project.json` `projectId` |
