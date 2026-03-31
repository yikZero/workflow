import { source } from './source';

const COOKBOOK_URL_RE = /\/docs\/cookbook(?=\/|$)/;

export function rewriteCookbookUrl(url: string): string {
  return url.replace(COOKBOOK_URL_RE, '/cookbooks');
}

/**
 * Extract the cookbook subtree from the docs page tree,
 * rewriting URLs from /docs/cookbook/... to /cookbooks/...
 */
export function getCookbookTree(lang: string) {
  const fullTree = source.pageTree[lang];

  const cookbookNode = fullTree.children.find(
    (node) => node.type === 'folder' && node.name === 'Cookbook'
  );

  if (!cookbookNode || cookbookNode.type !== 'folder') {
    return { name: 'Cookbooks', children: [] };
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
