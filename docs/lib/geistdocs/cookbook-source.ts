import type { Node } from 'fumadocs-core/page-tree';
import { source } from './source';

const COOKBOOK_DOCS_PREFIX_RE = /\/docs\/cookbook(?=\/|$)/g;

export function rewriteCookbookUrl(url: string): string {
  return url.replace(COOKBOOK_DOCS_PREFIX_RE, '/cookbooks');
}

export function rewriteCookbookUrlsInText(text: string): string {
  return text.replace(COOKBOOK_DOCS_PREFIX_RE, '/cookbooks');
}

function isCookbookFolder(node: Node): boolean {
  if (node.type !== 'folder') {
    return false;
  }

  if (node.index?.url?.startsWith('/docs/cookbook')) {
    return true;
  }

  return node.children.some((child) => {
    if (child.type === 'page') {
      return child.url.startsWith('/docs/cookbook');
    }
    if (child.type === 'folder') {
      return child.index?.url?.startsWith('/docs/cookbook') ?? false;
    }
    return false;
  });
}

/**
 * Extract the cookbook subtree from the docs page tree,
 * rewriting URLs from /docs/cookbook/... to /cookbooks/...
 */
export function getCookbookTree(lang: string) {
  const fullTree = source.pageTree[lang];

  const cookbookNode = fullTree.children.find(isCookbookFolder);

  if (!cookbookNode || cookbookNode.type !== 'folder') {
    return { name: 'Cookbooks', children: [] as Node[] };
  }

  return {
    name: 'Cookbooks',
    children: rewriteUrls(cookbookNode.children),
  };
}

function rewriteUrls<T>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const rewritten = { ...(node as Record<string, unknown>) };

    if (typeof rewritten.url === 'string') {
      rewritten.url = rewriteCookbookUrl(rewritten.url);
    }

    if (Array.isArray(rewritten.children)) {
      rewritten.children = rewriteUrls(rewritten.children);
    }

    if (rewritten.index && typeof rewritten.index === 'object') {
      const index = { ...(rewritten.index as Record<string, unknown>) };
      if (typeof index.url === 'string') {
        index.url = rewriteCookbookUrl(index.url);
      }
      rewritten.index = index;
    }

    return rewritten as T;
  });
}
