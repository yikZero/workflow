/**
 * Registry — installable Workflow patterns powered by `shadcn add`.
 *
 * Each `RegistryItem` is a recipe (workflow + API routes + UI) you can drop
 * into your app via the shadcn CLI. The data here drives both the listing
 * page (`/registry`) and the per-item detail page (`/registry/[id]`).
 *
 * To add a new provider:
 *   1. Append a new `RegistryItem` to `manifest.ts`.
 *   2. Author the source snippets and reference them via `snippets`.
 *   3. Submit the corresponding registry JSON to the shadcn registry index
 *      (https://ui.shadcn.com/docs/registry/registry-index) so the
 *      `installCommand` actually resolves.
 */

export type RegistryCategory =
  | 'provider'
  | 'agent'
  | 'vercel'
  | 'advanced'
  | 'common'
  | 'storage'
  | 'ai'
  | 'auth'
  | 'payments'
  | 'communication'
  | 'other';

export interface RegistryEnvVar {
  /** Variable name as it appears in `.env`. */
  name: string;
  /** One-line description of what the variable is. */
  description: string;
  /** URL the user can visit to obtain a key. */
  getKeyUrl?: string;
  /** Optional human-readable example value, e.g. `re_********`. */
  exampleValue?: string;
}

export interface RegistryFile {
  /** Path the file lands at after install, relative to the project root. */
  path: string;
  /** Short blurb shown next to the path on the detail page. */
  description: string;
}

export interface RegistrySnippet {
  /** Tab label shown above the code block. */
  label: string;
  /** Shiki language identifier (`tsx`, `ts`, `bash`, …). */
  lang: string;
  /** Raw source code — rendered via shiki on the server. */
  code: string;
  /** Optional caption rendered above the snippet. */
  caption?: string;
}

/**
 * Identifier for a provider brand mark. The Card / Detail hero look this up
 * in `components/registry/logos` to render the actual SVG. Adding a new
 * provider:
 *   1. Drop a `logo-<id>.tsx` SVG component in `components/registry/logos`
 *      that paints with `currentColor`.
 *   2. Register it in `components/registry/logos/index.ts`.
 *   3. Reference its key here.
 */
export type RegistryLogoId =
  | 'resend'
  | 'ai-sdk'
  | 'sandbox'
  | 'chat-sdk'
  | 'durable-agent'
  | 'human-in-the-loop'
  | 'agent-cancellation'
  | 'sequential-and-parallel'
  | 'workflow-composition'
  | 'saga'
  | 'batching'
  | 'rate-limiting'
  | 'scheduling'
  | 'timeouts'
  | 'idempotency'
  | 'webhooks'
  | 'child-workflows'
  | 'distributed-abort-controller';

export interface RegistryItem {
  /** Slug used in the URL — `/registry/${id}`. */
  id: string;
  /** Display name. */
  name: string;
  /** Provider brand-mark identifier; rendered on the card + detail hero. */
  logo?: RegistryLogoId;
  /** Short blurb (≤ 160 chars). Shown on the listing card and detail hero. */
  description: string;
  /** Long-form description rendered as a paragraph on the detail page. */
  longDescription?: string;
  /** Searchable tags rendered as small badges. */
  tags: string[];
  /**
   * Categories the item belongs to. Items can live in more than one — e.g. AI
   * SDK is both an `agent` pattern and a `vercel`-built integration. Each
   * category renders as its own badge on the card and matches every relevant
   * filter on the listing page.
   */
  categories: RegistryCategory[];
  /** Provider homepage / product page. */
  homepage: string;
  /** Provider docs entry-point linked from the detail hero. */
  docsUrl?: string;
  /** Public GitHub source URL for the snippet, when it lives in a public repo. */
  sourceUrl?: string;
  /**
   * shadcn registry slug — the exact argument you'd pass to
   * `pnpm dlx shadcn@latest add ${shadcnSlug}`. Use the JSON URL or the
   * registered short-name. While the registry PR is in flight this can be a
   * placeholder; the install command on the detail page will reflect it
   * verbatim.
   */
  shadcnSlug: string;
  /** Required environment variables. */
  envVars?: RegistryEnvVar[];
  /** Files that get added to the user's project on install. */
  files: RegistryFile[];
  /** Code snippets shown on the detail page (workflow source, usage, etc.). */
  snippets: RegistrySnippet[];
}
