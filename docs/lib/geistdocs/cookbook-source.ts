import { source } from './source';

/**
 * Extract the cookbook subtree from the docs page tree,
 * rewriting URLs from /docs/cookbook/... to /cookbooks/...
 */
export function getCookbookTree(lang: string) {
  const fullTree = source.pageTree[lang];

  // Find the cookbook folder in the tree
  const cookbookNode = fullTree.children.find(
    (node) => node.type === 'folder' && node.name === 'Cookbook'
  );

  if (!cookbookNode || cookbookNode.type !== 'folder') {
    return { name: 'Cookbooks', children: [] };
  }

  // Deep-clone and rewrite URLs
  return {
    name: 'Cookbooks',
    children: rewriteUrls(cookbookNode.children),
  };
}

function rewriteUrls<T>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const n = node as Record<string, unknown>;
    const rewritten = { ...n };

    if (typeof rewritten.url === 'string') {
      rewritten.url = rewritten.url.replace(
        /\/docs\/cookbook\//,
        '/cookbooks/'
      );
    }

    if (Array.isArray(rewritten.children)) {
      rewritten.children = rewriteUrls(rewritten.children);
    }

    // Handle index page inside folders
    if (rewritten.index && typeof rewritten.index === 'object') {
      const idx = { ...(rewritten.index as Record<string, unknown>) };
      if (typeof idx.url === 'string') {
        idx.url = idx.url.replace(/\/docs\/cookbook\//, '/cookbooks/');
      }
      rewritten.index = idx;
    }

    return rewritten as T;
  });
}
