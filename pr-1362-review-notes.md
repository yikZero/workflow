# PR #1362 Review Notes

**PR:** [vercel/workflow#1362](https://github.com/vercel/workflow/pull/1362) — "Add DurableAgent compat tests, e2e tests, and migrate to AI SDK v6"
**Author:** Pranay Prakash (@pranaygp), co-authored with Claude Opus 4.6
**Stats:** +9,127 / -490 lines | 67 files changed | 31 commits
**Reviewed:** 2026-03-13

---

## Summary

This PR does three things:

1. **Migrates from AI SDK v5 to v6** — peer dep `ai ^5||^6` narrowed to `^6`, `@ai-sdk/provider ^2||^3` to `^3`, catalog `ai: 5.0.104` to `6.0.116`
2. **Adds DurableAgent compat + e2e tests** — 36-test compat suite (14 pass, 22 `it.fails()` for known gaps), 14 e2e tests (all pass)
3. **Extends DurableAgent API** toward ToolLoopAgent parity — `instructions`, `onStepFinish`/`onFinish` on constructor, `timeout` on stream, mock test providers

---

## Edge Cases & Potential Issues

### 1. Duplicate `normalizeFinishReason` implementations with different logic

**Files:** `do-stream-step.ts:512-523` and `stream-text-iterator.ts:473-481`

The `do-stream-step.ts` version checks `objReason.type`:
```ts
const objReason = rawFinishReason as { type?: string };
return (objReason.type as FinishReason) ?? 'unknown';
```

The `stream-text-iterator.ts` version checks `obj.unified` first (correct for V3):
```ts
const obj = raw as { unified?: FinishReason; type?: FinishReason };
return obj.unified ?? obj.type ?? 'unknown';
```

If a V3 model ever emits `{ unified: 'tool-calls', raw: 'tool_use' }`, the `do-stream-step.ts` version would return `'unknown'` (because it checks `.type` not `.unified`), which would propagate into `StepResult.finishReason` and affect `onStepFinish` callbacks, `stopWhen` conditions, and structured output parsing context.

Currently safe because V3 models appear to emit V2-format string finishReasons through the compatibility layer, but this is fragile. These two functions should be consolidated.

**Risk:** Low-medium. Only manifests if a V3 model emits object-format finish reasons at runtime.

### 2. `'unknown'` finish reason fallback removed in AI SDK v6

**Files:** `do-stream-step.ts:516,522`, `stream-text-iterator.ts:388,478`

AI SDK v6 removed `'unknown'` from the `FinishReason` type, replacing it with `'other'`. Both `normalizeFinishReason` functions fall back to `'unknown'`, and `stream-text-iterator.ts:388` handles `'unknown'` explicitly. This works at runtime (TypeScript types don't enforce at runtime), but is technically inconsistent with the v6 spec.

**Risk:** Low. TypeScript won't catch downstream code doing exhaustive switch on FinishReason if `'unknown'` is no longer a variant.

### 3. `toolsToModelTools` is synchronous — safe today but fragile for Zod v4 async schemas

**File:** `tools-to-model-tools.ts:11`

```ts
inputSchema: asSchema(tool.inputSchema).jsonSchema,
```

I verified at runtime that `asSchema().jsonSchema` is **synchronous** in `ai@6.0.116` even with Zod v4 (`zod@4.3.6`). However, the AI SDK v6 migration guide mentions async schema support was added, and future AI SDK updates could make `.jsonSchema` return a Promise for certain schema types (e.g., schemas with lazy/recursive definitions). If that happens, this would silently pass a Promise as the `inputSchema` JSON.

**Risk:** Low today. Worth making async preemptively or adding a comment.

### 4. `DurableAgentOptions` doesn't include `instructions` — only `system`

**File:** `durable-agent.ts:295-325`

The PR adds `instructions` support at the stream level and in e2e tests (`agentInstructionsStringE2e`), but `DurableAgentOptions` (constructor) still only has `system`. The AI SDK v6's ToolLoopAgent renamed `system` to `instructions`. Users migrating from ToolLoopAgent might expect `instructions` on the constructor.

The compat tests (`durable-agent-compat.test.ts`) likely test this gap explicitly, but it should be documented as a known divergence.

**Risk:** Low. Behavioral — `system` still works, but API divergence from ToolLoopAgent.

### 5. `onFinish` event shape doesn't include `text`, `finishReason`, `totalUsage`

**File:** `durable-agent.ts:330-354`

The `StreamTextOnFinishCallback` event type has `steps`, `messages`, `experimental_context`, and `experimental_output` — but not `text`, `finishReason`, or `totalUsage`. The PR description says these were added, and the e2e test (`agentOnFinishE2e`) casts with `(event as any).text` to access them. If the enrichment was supposed to be in this PR, it's missing from the type and runtime. If it's a known gap, the compat tests should have a failing case for it.

**Risk:** Medium. Users relying on `onFinish` for `text`/`finishReason`/`totalUsage` will get `undefined` unless the e2e mock is handling this differently than production.

### 6. `CompatibleLanguageModel` V3 doStream signature forces V2 stream parts

**File:** `types.ts:22-36`

```ts
doStream(options: LanguageModelV2CallOptions): PromiseLike<{
  stream: ReadableStream<LanguageModelV2StreamPart>;
}>;
```

This type asserts that V3 models return V2 stream parts. At runtime, V3 models might emit V3-format stream parts (e.g., `tool-input-start`/`tool-input-delta`/`tool-input-end` instead of `tool-call-streaming-start`/`tool-call-delta`). The `do-stream-step.ts` transform handles `tool-input-start`, `tool-input-delta`, `tool-input-end` already (lines 383-407), which is good.

However, the transform's `default` case silently drops unknown chunk types (line 473-477). Any V3-only stream part types not explicitly handled would be silently lost.

**Risk:** Low-medium. Silent data loss for any V3-specific stream parts not in the handler.

### 7. `providerExecuted` guard still present

**File:** `do-stream-step.ts:217`

```ts
if (chunk.providerExecuted) {
```

The PR description mentions "providerExecuted guard removed from tool-result stream parts (V3: all tool-results are provider-executed)". But the guard is still present. If V3 models emit tool-result parts without `providerExecuted` (because all results are provider-executed in V3), the guard would fail and provider tool results would not be captured.

However, at runtime with current providers, `providerExecuted` appears to still be present on the stream parts. This is safe today.

**Risk:** Low. May need updating when providers fully adopt V3 semantics.

### 8. Tests only use string finishReasons, not V6 object format

**Files:** `stream-text-iterator.test.ts`, `durable-agent.test.ts`

All test mocks use `finishReason: 'stop'` (V2 string format). There are zero tests for the V6 object format `{ unified: 'stop', raw: 'end_turn' }`. The `normalizeFinishReason` function in `stream-text-iterator.ts` handles both, but the `do-stream-step.ts` version doesn't handle `unified` (see issue #1).

**Risk:** Medium. No regression safety for object-format finish reasons.

### 9. Concurrent tool execution with `Promise.all` — no error isolation

**File:** `durable-agent.ts:887-898, 992-1003`

Both executable tool calls and client-side tool calls are executed with `Promise.all()`. If one tool throws a `FatalError`, all concurrent tools in that step are effectively abandoned. The AI SDK's ToolLoopAgent has more sophisticated per-tool error handling.

This is pre-existing behavior (not introduced by this PR), but the new compat tests should cover it.

**Risk:** Low (pre-existing).

### 10. `writeToolOutputToUI` accesses `result.output.value` without null check

**File:** `stream-text-iterator.ts:443`

```ts
output: result.output.value,
```

If a tool result has `output: undefined` (e.g., from a provider that returns no output), this would throw `TypeError: Cannot read property 'value' of undefined`.

**Risk:** Low. Would require a malformed tool result.

---

## AI SDK v6 Breaking Changes Audit

| Breaking Change | Addressed? | Notes |
|---|---|---|
| `CoreMessage` -> `ModelMessage` | Yes | All imports use `ModelMessage` |
| `convertToModelMessages()` now async | Yes | Docs updated to `await` it |
| `system` -> `instructions` on Agent | Partial | Stream-level support added, constructor still uses `system` |
| `ToolCallOptions` -> `ToolExecutionOptions` | N/A | DurableAgent uses custom tool execution |
| `generateObject`/`streamObject` deprecated | N/A | Not used |
| Usage metrics restructured (`inputTokenDetails`, etc.) | Partial | `chunksToStep` uses `finish?.usage` which passes through raw format; `aggregateUsage` mentioned in PR desc but not found in code |
| `FinishReason "unknown"` removed -> `"other"` | No | Still using `'unknown'` as fallback |
| Provider spec V2 -> V3 | Yes | `CompatibleLanguageModel` handles both |
| Warnings system unified | N/A | Warnings passed through |
| MCP client moved to `@ai-sdk/mcp` | N/A | Not used |
| `addToolResult` -> `addToolOutput` | N/A | Not used (WorkflowChatTransport uses its own mechanism) |
| `isToolUIPart` renames | N/A | Not directly used |
| `ToolLoopAgent` default `stopWhen` changed to `stepCountIs(20)` | Note | DurableAgent defaults to `Infinity` (intentional divergence) |
| Tool `strict` mode per-tool | N/A | Passed through to provider |
| `toModelOutput` receives `({output})` not raw output | N/A | Not used |
| Zod 4 support | Yes | Already using `zod@4.3.6` |
| `needsApproval` tool function | No | Acknowledged GAP in compat tests |
| `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish` | No | Acknowledged GAPs in compat tests |
| `prepareCall` | No | Acknowledged GAP in compat tests |

---

## GitHub Issues Analysis

### Issues addressed or improved by this PR

| Issue | Title | Status | Impact |
|---|---|---|---|
| [#168](https://github.com/vercel/workflow/issues/168) | DurableAgent missing feature parity with AI SDK Agent class | OPEN | **Partially resolved** — adds `instructions`, `onStepFinish`, `onFinish`, `timeout`, compat test suite documents 22 remaining gaps |
| [#628](https://github.com/vercel/workflow/issues/628) | Support for provider-executed tools (AI SDK v6 / LanguageModelV3) | CLOSED | **Compatible** — provider-executed tool support preserved and functional with v6 |
| [#739](https://github.com/vercel/workflow/issues/739) | Add UI Message Support to DurableAgent onFinish callback | CLOSED | **Compatible** — `collectUIMessages` feature preserved |
| [#1180](https://github.com/vercel/workflow/issues/1180) | DurableAgent: single tool exception breaks entire agent stream | CLOSED | **Compatible** — error-text recovery pattern preserved in `executeTool` |
| [#847](https://github.com/vercel/workflow/issues/847) | DurableAgent throws error for tools without execute function | CLOSED | **Compatible** — client-side tool detection preserved |
| [#849](https://github.com/vercel/workflow/issues/849) | DurableAgent stringifies tool call outputs | CLOSED | **Compatible** — JSON/text output type detection preserved |
| [#880](https://github.com/vercel/workflow/issues/880) | DurableAgent + OpenAI Responses API fails on tool calls (missing reasoning) | CLOSED | **Compatible** — `sanitizeProviderMetadataForToolCall` strips OpenAI `itemId` |
| [#727](https://github.com/vercel/workflow/issues/727) | Gemini tool-calls fail after first step (thought_signature dropped) | CLOSED | **Compatible** — Gemini metadata preserved in `sanitizeProviderMetadataForToolCall` |
| [#433](https://github.com/vercel/workflow/issues/433) | DurableAgent: Tool googleSearch does not have an execute function | CLOSED | **Compatible** — client-side tool handling preserved |
| [#389](https://github.com/vercel/workflow/issues/389) | Can't seem to set `experimental_telemetry` in `DurableAgent.stream` | OPEN | **Improved** — telemetry can be set at both constructor and stream level, but still a GAP (#1296) for actual span emission |

### Issues NOT regressed by this PR

| Issue | Title | Status | Notes |
|---|---|---|---|
| [#1186](https://github.com/vercel/workflow/issues/1186) | WorkflowChatTransport treats client abort as reconnectable | CLOSED | PR adds `body`/`headers` forwarding but doesn't affect reconnect logic |
| [#726](https://github.com/vercel/workflow/issues/726) | WorkflowChatTransport duplicate prepareReconnectToStreamRequest calls | CLOSED | Not affected |
| [#709](https://github.com/vercel/workflow/issues/709) | Bundler Error while importing WorkflowChatTransport | CLOSED | Not affected |
| [#980](https://github.com/vercel/workflow/issues/980) | Readable stream from run.getReadable() silently closes after ~5 min | CLOSED | Not affected |
| [#764](https://github.com/vercel/workflow/issues/764) | LLM Streaming Response Becomes so Slow in Vercel World | CLOSED | Not affected |
| [#265](https://github.com/vercel/workflow/issues/265) | Vercel OIDC token auto-refresh doesn't work | CLOSED | Not affected |
| [#219](https://github.com/vercel/workflow/issues/219) | Supporting "use step" and "use workflow" inside arrow functions | CLOSED | Not affected |
| [#829](https://github.com/vercel/workflow/issues/829) | Add Agent Skill for idiomatic workflow usage and best practices | CLOSED | Not affected |
| [#25](https://github.com/vercel/workflow/issues/25) | Docs: Need better documentation for using streams | CLOSED | Not affected |
| [#1369](https://github.com/vercel/workflow/issues/1369) | Closure variables break steps from being reused | CLOSED | Not affected |
| [#1365](https://github.com/vercel/workflow/issues/1365) | 3 compiler bugs related to closure variables | OPEN | Not affected (compiler issue) |

### Issues still open and separate (not addressed by this PR)

| Issue | Title | Status | Notes |
|---|---|---|---|
| [#1296](https://github.com/vercel/workflow/issues/1296) | DurableAgent `experimental_telemetry` does not emit AI SDK spans | OPEN | **Still resolvable, separate** — Acknowledged as GAP in compat tests |
| [#848](https://github.com/vercel/workflow/issues/848) | Support LanguageModelV3ToolResultOutput for multimodal tool results | OPEN | **Still resolvable, separate** — V3-specific feature, not in scope |
| [#975](https://github.com/vercel/workflow/issues/975) | Duplicate messages in UI when writing custom data parts before agent.stream | OPEN | **Still resolvable, separate** — UI-level issue |
| [#399](https://github.com/vercel/workflow/issues/399) | DurableAgent tool error text not properly converting to UI tool error parts | OPEN | **Still resolvable, separate** — error-text vs error UI part mapping |
| [#839](https://github.com/vercel/workflow/issues/839) | AsyncLocalStorage context lost in tool execution | OPEN | **Still resolvable, separate** — runtime context issue |
| [#943](https://github.com/vercel/workflow/issues/943) | Steps hang until 300s timeout despite completing in seconds | OPEN | **Still resolvable, separate** — backend/runtime issue |
| [#1349](https://github.com/vercel/workflow/issues/1349) | run.getReadable()/run.readable do not propagate cancel | OPEN | **Still resolvable, separate** — stream lifecycle issue |
| [#1266](https://github.com/vercel/workflow/issues/1266) | sleep() causes 'Unconsumed event' when called concurrently | OPEN | **Still resolvable, separate** — core runtime issue |
| [#1160](https://github.com/vercel/workflow/issues/1160) | Significant step queue times (~4-5s) | OPEN | **Still resolvable, separate** — performance issue |
| [#1012](https://github.com/vercel/workflow/issues/1012) | Workflow scaling issues | OPEN | **Still resolvable, separate** |
| [#266](https://github.com/vercel/workflow/issues/266) | Long-running streams UX | OPEN | **Still resolvable, separate** |
| [#469](https://github.com/vercel/workflow/issues/469) | Stale generated files break streaming after code changes | OPEN | **Still resolvable, separate** |
| [#448](https://github.com/vercel/workflow/issues/448) | TypeError: Cannot perform ArrayBuffer.prototype.slice - Turborepo | OPEN | **Still resolvable, separate** |

---

## Recommendations

1. **Consolidate `normalizeFinishReason`** — The two implementations should be a single shared function (preferably the `stream-text-iterator.ts` version that handles `unified`).
2. **Replace `'unknown'` fallback with `'other'`** to match v6 spec.
3. **Add unit tests for object-format finish reasons** to guard against V3 model behavior.
4. **Consider adding `instructions` to `DurableAgentOptions` constructor** as an alias for `system` to reduce API divergence from ToolLoopAgent.
5. **Add null guard in `writeToolOutputToUI`** for `result.output.value`.
6. **Verify the `onFinish` event enrichment** — The e2e test expects `text`, `finishReason`, `totalUsage` but the type doesn't include them. Either add to type + runtime, or update the e2e test expectations.
