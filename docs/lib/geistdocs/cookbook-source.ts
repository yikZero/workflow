import type { Node, Root } from 'fumadocs-core/page-tree';
import { source } from './source';

const COOKBOOK_DOCS_PREFIX_RE = /\/docs\/cookbook(?=\/|$)/g;

type FolderNode = Extract<Node, { type: 'folder' }>;
type PageNode = Extract<Node, { type: 'page' }>;

export function rewriteCookbookUrl(url: string): string {
  return url.replace(COOKBOOK_DOCS_PREFIX_RE, '/cookbooks');
}

export function rewriteCookbookUrlsInText(text: string): string {
  return text.replace(COOKBOOK_DOCS_PREFIX_RE, '/cookbooks');
}

function isCookbookFolder(node: Node): node is FolderNode {
  if (node.type !== 'folder') return false;

  if (node.index?.url?.startsWith('/docs/cookbook')) return true;

  // Fallback: check if children contain cookbook pages
  return node.children.some((child) => {
    if (child.type === 'page') return child.url.startsWith('/docs/cookbook');
    if (child.type === 'folder')
      return child.index?.url?.startsWith('/docs/cookbook') ?? false;
    return false;
  });
}

function rewriteNode<T extends Record<string, unknown>>(node: T): T {
  const rewritten = { ...node };

  if (typeof rewritten.url === 'string') {
    rewritten.url = rewriteCookbookUrl(rewritten.url);
  }

  if (rewritten.index && typeof rewritten.index === 'object') {
    rewritten.index = rewriteNode(
      rewritten.index as Record<string, unknown>,
    );
  }

  if (Array.isArray(rewritten.children)) {
    rewritten.children = rewritten.children.map((child) =>
      rewriteNode(child as Record<string, unknown>),
    );
  }

  return rewritten as T;
}

function createOverviewPage(cookbookNode: FolderNode): PageNode | null {
  if (!cookbookNode.index) {
    return null;
  }

  return {
    type: 'page',
    $id: `${cookbookNode.$id}__overview`,
    name: 'Overview',
    url: rewriteCookbookUrl(cookbookNode.index.url),
  } as PageNode;
}

/**
 * Extract the cookbook subtree from the docs page tree,
 * rewriting URLs from /docs/cookbook/... to /cookbooks/...
 * Returns a proper Root tree with an Overview entry for the landing page.
 */
export function getCookbookTree(lang: string): Root {
  const fullTree = source.pageTree[lang];

  const cookbookNode = fullTree.children.find(isCookbookFolder);

  if (!cookbookNode) {
    throw new Error('Cookbook tree not found in docs source');
  }

  const overview = createOverviewPage(cookbookNode);

  const categoryNodes = cookbookNode.children.map(
    (child) => rewriteNode(child as Record<string, unknown>) as Node,
  );

  return {
    ...fullTree,
    name: 'Cookbooks',
    children: [...(overview ? [overview] : []), ...categoryNodes],
  };
}
