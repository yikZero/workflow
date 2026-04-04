// @ts-check
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

/**
 * Custom TypeDoc plugin that:
 * 1. Injects `title` and `type` frontmatter for each generated page
 * 2. Strips `.mdx` extensions from links (Fumadocs uses clean URLs)
 * 3. Escapes remaining unescaped curly braces in inline code spans
 *    that `sanitizeComments` missed (e.g., JSDoc @example in table cells)
 *
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
  // Set "title" frontmatter for each page
  app.renderer.on(
    MarkdownPageEvent.BEGIN,
    /** @param {import('typedoc-plugin-markdown').MarkdownPageEvent} page */
    (page) => {
      page.frontmatter = {
        ...page.frontmatter,
        title: page.model.name,
        type: 'reference',
      };
    }
  );

  // Post-process page contents
  app.renderer.on(
    MarkdownPageEvent.END,
    /** @param {import('typedoc-plugin-markdown').MarkdownPageEvent} page */
    (page) => {
      if (!page.contents) return;

      // Strip `.mdx` extensions from links
      page.contents = page.contents.replace(/\.mdx/g, '');

      // Escape any remaining unescaped { and } in the content.
      // The `sanitizeComments` typedoc option handles most cases, but
      // misses curly braces inside inline code spans within table cells
      // (e.g., JSDoc @example blocks rendered inline in property tables).
      // MDX treats unescaped `{...}` as JSX expressions which breaks the build.
      page.contents = escapeRemainingBraces(page.contents);
    }
  );
}

/**
 * Escapes any `{` and `}` that are not already escaped (i.e., not preceded
 * by a backslash) and are not inside fenced code blocks. This catches
 * cases that `sanitizeComments` misses.
 *
 * @param {string} content
 * @returns {string}
 */
function escapeRemainingBraces(content) {
  const lines = content.split('\n');
  let inFencedCodeBlock = false;
  const result = [];

  for (const line of lines) {
    // Track fenced code block boundaries
    if (/^```/.test(line.trimStart())) {
      inFencedCodeBlock = !inFencedCodeBlock;
      result.push(line);
      continue;
    }

    if (inFencedCodeBlock) {
      result.push(line);
      continue;
    }

    // Replace unescaped { and } (not preceded by \)
    // Preserve <a id="..."></a> anchor tags by temporarily replacing them
    const anchors = [];
    let processed = line.replace(/<a\s[^>]*>[\s\S]*?<\/a>/g, (match) => {
      anchors.push(match);
      return `__TYPEDOC_ANCHOR_${anchors.length - 1}__`;
    });

    // Escape unescaped braces (not already preceded by backslash)
    processed = processed
      .replace(/(?<!\\)\{/g, '\\{')
      .replace(/(?<!\\)\}/g, '\\}');

    // Restore anchor tags
    for (let i = 0; i < anchors.length; i++) {
      processed = processed.replace(`__TYPEDOC_ANCHOR_${i}__`, anchors[i]);
    }

    result.push(processed);
  }

  return result.join('\n');
}
