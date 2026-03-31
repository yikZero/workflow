'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  tree,
  recipes,
  slugToCategory,
  categoryLabels,
  categoryOrder,
  type Branch,
  type Recipe,
  type RecipeCategory,
  type TreeNode,
} from '@/lib/cookbook-tree';

type PathEntry = { nodeId: string; branchIndex: number };
type ExplorerMode = 'guided' | 'browse';
type CategoryFilter = RecipeCategory | 'all';

function getRecipeCategory(recipe: Recipe): RecipeCategory {
  return slugToCategory[recipe.slug] as RecipeCategory;
}

function getRecipeHref(lang: string, recipe: Recipe) {
  return `/${lang}/cookbooks/${getRecipeCategory(recipe)}/${recipe.slug}`;
}

function RecipeCard({
  lang,
  recipe,
  highlighted = false,
}: {
  lang: string;
  recipe: Recipe;
  highlighted?: boolean;
}) {
  const category = getRecipeCategory(recipe);
  return (
    <Link
      href={getRecipeHref(lang, recipe)}
      className={`group flex flex-col rounded-xl border p-6 transition-all hover:border-muted-foreground/40 hover:bg-accent ${
        highlighted
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {categoryLabels[category]}
        </span>
        <span>{recipe.slug}</span>
      </div>
      <p className="mt-4 text-base leading-relaxed text-foreground">
        {recipe.whenToUse}
      </p>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-mono font-medium text-muted-foreground transition-colors group-hover:text-primary">
            {recipe.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
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
          className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}

export function CookbookExplorer({ lang }: { lang: string }) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ExplorerMode>('guided');
  const [path, setPath] = useState<PathEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const allRecipes = useMemo(
    () =>
      Object.values(recipes).sort((a, b) => {
        const categoryCompare =
          categoryOrder.indexOf(getRecipeCategory(a)) -
          categoryOrder.indexOf(getRecipeCategory(b));
        if (categoryCompare !== 0) return categoryCompare;
        return a.title.localeCompare(b.title);
      }),
    []
  );

  const recipeCount = allRecipes.length;

  const countsByCategory = useMemo(() => {
    return categoryOrder.reduce(
      (acc, category) => {
        acc[category] = allRecipes.filter(
          (recipe) => getRecipeCategory(recipe) === category
        ).length;
        return acc;
      },
      {} as Record<RecipeCategory, number>
    );
  }, [allRecipes]);

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRecipes.filter((recipe) => {
      const category = getRecipeCategory(recipe);
      if (selectedCategory !== 'all' && category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        recipe.title,
        recipe.slug,
        recipe.description,
        recipe.whenToUse,
        categoryLabels[category],
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRecipes, query, selectedCategory]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, selectedCategory]);

  const openRecipe = useCallback(
    (recipe: Recipe | undefined) => {
      if (!recipe) return;
      router.push(getRecipeHref(lang, recipe));
    },
    [lang, router]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (
        ((event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'k') ||
        (event.key === '/' && !isEditable)
      ) {
        event.preventDefault();
        setMode('browse');
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }

      if (mode !== 'browse' || filteredRecipes.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % filteredRecipes.length);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(
          (index) =>
            (index - 1 + filteredRecipes.length) % filteredRecipes.length
        );
      }
      if (
        event.key === 'Enter' &&
        document.activeElement === searchInputRef.current
      ) {
        event.preventDefault();
        openRecipe(filteredRecipes[activeIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, filteredRecipes, activeIndex, openRecipe]);

  // --- Guided mode state ---

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

  const resultRecipes = useMemo(
    () =>
      (resultSlugs ?? [])
        .map((slug) => recipes[slug])
        .filter((recipe): recipe is Recipe => recipe != null),
    [resultSlugs]
  );

  return (
    <div>
      {/* Mode switcher */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('guided')}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            mode === 'guided'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Guide me
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('browse');
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            mode === 'browse'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Browse all
        </button>
        <span className="ml-2 text-xs font-mono text-muted-foreground">
          Press{' '}
          <kbd className="rounded border border-border px-1.5 py-0.5">/</kbd>{' '}
          or{' '}
          <kbd className="rounded border border-border px-1.5 py-0.5">
            ⌘K
          </kbd>
        </span>
      </div>

      {/* Browse mode */}
      {mode === 'browse' ? (
        <div>
          <div className="mb-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search recipes, use cases, or slugs"
                autoComplete="off"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                  selectedCategory === 'all'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                All {recipeCount}
              </button>
              {categoryOrder.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                    selectedCategory === category
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {categoryLabels[category]} ({countsByCategory[category]})
                </button>
              ))}
            </div>
          </div>

          <p className="mb-6 text-sm text-muted-foreground">
            {filteredRecipes.length} of {recipeCount} recipes. Use
            &uarr;/&darr; to move and Enter to open the highlighted result.
          </p>

          {filteredRecipes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No recipes match <span className="font-mono">{query}</span>. Try
              a broader term like <span className="font-mono">retry</span>,{' '}
              <span className="font-mono">approval</span>, or{' '}
              <span className="font-mono">webhook</span>.
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredRecipes.map((recipe, index) => (
                <RecipeCard
                  key={recipe.slug}
                  lang={lang}
                  recipe={recipe}
                  highlighted={index === activeIndex}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Guided mode */
        <div>
          {breadcrumbs.length > 0 && (
            <div className="mb-8 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={restart}
                className="text-xs font-mono text-muted-foreground transition-colors hover:text-foreground"
              >
                Start
              </button>
              {breadcrumbs.map((crumb, index) => (
                <div
                  key={`crumb-${crumb.label}-${index}`}
                  className="flex items-center gap-2"
                >
                  <span className="text-muted-foreground">&rarr;</span>
                  <button
                    type="button"
                    onClick={() => goToStep(index + 1)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono text-primary transition-colors hover:bg-primary/20"
                  >
                    <span>{crumb.icon}</span>
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>
          )}

          {currentNode && !resultSlugs && (
            <div className="mb-10">
              <h2 className="mb-2 text-2xl font-semibold text-foreground">
                {currentNode.question}
              </h2>
              {currentNode.id === 'root' && (
                <p className="mb-6 text-sm text-muted-foreground">
                  Answer a few questions to find the right pattern from{' '}
                  {recipeCount} recipes, or switch to{' '}
                  <strong>Browse all</strong> if you already know roughly what
                  you want.
                </p>
              )}
              <div className="grid gap-3">
                {currentNode.branches.map((branch, index) => (
                  <button
                    key={branch.label}
                    type="button"
                    onClick={() => chooseBranch(index)}
                    className="group rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg transition-colors group-hover:border-primary/40 group-hover:bg-primary/10">
                        {branch.icon}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
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

          {resultSlugs && (
            <div>
              <h2 className="mb-1 text-xl font-semibold text-foreground">
                Here&apos;s what fits
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                {resultRecipes.length} recipe
                {resultRecipes.length !== 1 ? 's' : ''} match your path.
              </p>
              <div className="grid gap-4">
                {resultRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.slug}
                    lang={lang}
                    recipe={recipe}
                  />
                ))}
              </div>
              <div className="mt-8">
                <button
                  type="button"
                  onClick={restart}
                  className="text-sm font-mono text-muted-foreground transition-colors hover:text-foreground"
                >
                  &larr; Start over
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
