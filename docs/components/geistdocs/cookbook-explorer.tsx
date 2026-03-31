'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  tree,
  recipes,
  slugToCategory,
  type Branch,
  type TreeNode,
} from '@/lib/cookbook-tree';

type PathEntry = { nodeId: string; branchIndex: number };

export function CookbookExplorer({ lang }: { lang: string }) {
  const [path, setPath] = useState<PathEntry[]>([]);

  const { currentNode, resultSlugs } = useMemo(() => {
    let node: TreeNode | undefined = tree;
    let slugs: string[] | undefined;

    for (const entry of path) {
      if (!node) break;
      const branch: Branch = node.branches[entry.branchIndex];
      if (branch.slugs) {
        slugs = branch.slugs;
        node = undefined;
      } else if (branch.next) {
        node = branch.next;
      }
    }

    return { currentNode: node, resultSlugs: slugs };
  }, [path]);

  const chooseBranch = useCallback(
    (branchIndex: number) => {
      if (!currentNode) return;
      setPath((prev) => [...prev, { nodeId: currentNode.id, branchIndex }]);
    },
    [currentNode]
  );

  const goToStep = useCallback((stepIndex: number) => {
    setPath((prev) => prev.slice(0, stepIndex));
  }, []);

  const restart = useCallback(() => setPath([]), []);

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; icon: string }[] = [];
    let node: TreeNode | undefined = tree;
    for (const entry of path) {
      if (!node) break;
      const branch: Branch = node.branches[entry.branchIndex];
      crumbs.push({ label: branch.label, icon: branch.icon });
      node = branch.next;
    }
    return crumbs;
  }, [path]);

  const resultRecipes = useMemo(() => {
    if (!resultSlugs) return [];
    return resultSlugs.map((s) => recipes[s]).filter((r) => r != null);
  }, [resultSlugs]);

  const recipeCount = Object.keys(recipes).length;

  return (
    <div>
      {/* Breadcrumb path */}
      {breadcrumbs.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={restart}
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Start
          </button>
          {breadcrumbs.map((crumb, i) => (
            <div
              key={`crumb-${crumb.label}`}
              className="flex items-center gap-2"
            >
              <span className="text-muted-foreground">&rarr;</span>
              <button
                type="button"
                onClick={() => goToStep(i + 1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono text-primary hover:bg-primary/20 transition-colors"
              >
                <span>{crumb.icon}</span>
                {crumb.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Current question with branches */}
      {currentNode && !resultSlugs && (
        <div className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            {currentNode.question}
          </h2>
          {currentNode.id === 'root' && (
            <p className="text-sm text-muted-foreground mb-6">
              Answer a few questions to find the right pattern from{' '}
              {recipeCount} recipes. Each result includes a code example you can
              copy.
            </p>
          )}
          <div className="grid gap-3">
            {currentNode.branches.map((branch, i) => (
              <button
                key={branch.label}
                type="button"
                onClick={() => chooseBranch(i)}
                className="group text-left rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-primary/5"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg group-hover:border-primary/40 group-hover:bg-primary/10 transition-colors">
                    {branch.icon}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {branch.label}
                    </h3>
                    {branch.slugs && (
                      <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                        {branch.slugs.length} recipe
                        {branch.slugs.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    {branch.next && (
                      <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                        More choices &rarr;
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {resultSlugs && (
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">
            Here&apos;s what fits
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {resultRecipes.length} recipe
            {resultRecipes.length !== 1 ? 's' : ''} match your path.
          </p>
          <div className="grid gap-4">
            {resultRecipes.map((recipe) => {
              const category = slugToCategory[recipe.slug];
              return (
                <Link
                  key={recipe.slug}
                  href={`/${lang}/cookbooks/${category}/${recipe.slug}`}
                  className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-muted-foreground/40 hover:bg-accent"
                >
                  <p className="text-base leading-relaxed text-foreground">
                    {recipe.whenToUse}
                  </p>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-mono font-medium text-muted-foreground group-hover:text-primary transition-colors">
                        {recipe.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-2">
                        {recipe.description}
                      </p>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={restart}
              className="text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
