import type { Root } from 'fumadocs-core/page-tree';
import { DocsLayout } from '@/components/geistdocs/docs-layout';
import { source } from '@/lib/geistdocs/source';

function withoutCookbook(tree: Root): Root {
  return {
    ...tree,
    children: tree.children.filter((node) => {
      if (node.type !== 'folder') return true;
      return !node.index?.url?.startsWith('/docs/cookbook');
    }),
  };
}

const Layout = async ({ children, params }: LayoutProps<'/[lang]/docs'>) => {
  const { lang } = await params;

  return (
    <DocsLayout tree={withoutCookbook(source.pageTree[lang])}>
      {children}
    </DocsLayout>
  );
};

export default Layout;
