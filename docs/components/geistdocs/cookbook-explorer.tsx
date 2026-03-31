'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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

type RecipeCardProps = {
  lang: string;
  recipe: Recipe;
  highlighted?: boolean;
  linkRef?: (node: HTMLAnchorElement | null) => void;
  onFocus?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLAnchorElement>) => void;
};

type SearchParamReader = { get(name: string): string | null };

const VIEW_PARAM = 'view';
const QUERY_PARAM = 'q';
const CATEGORY_PARAM = 'category';

function isRecipeCategory(value: string | null): value is RecipeCategory {
  return value != null && categoryOrder.includes(value as RecipeCategory);
}

function readExplorerMode(params: SearchParamReader): ExplorerMode {
  return params.get(VIEW_PARAM) === 'browse' ? 'browse' : 'guided';
}

function readExplorerQuery(params: SearchParamReader): string {
  return params.get(QUERY_PARAM) ?? '';
}

function readExplorerCategory(params: SearchParamReader): CategoryFilter {
  const value = params.get(CATEGORY_PARAM);
  return isRecipeCategory(value) ? value : 'all';
}

function buildExplorerUrl(
  pathname: string,
  mode: ExplorerMode,
  query: string,
  category: CategoryFilter
) {
  const params = new URLSearchParams();
  if (mode === 'browse') params.set(VIEW_PARAM, 'browse');
  if (query.trim()) params.set(QUERY_PARAM, query.trim());
  if (category !== 'all') params.set(CATEGORY_PARAM, category);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

type QuickPick = {
  label: string;
  query: string;
  category: CategoryFilter;
  description: string;
};

const QUICK_PICKS: QuickPick[] = [
  {
    label: 'Retry flaky APIs',
    query: 'retry',
    category: 'resilience',
    description: 'Backoff, 429s, circuit breakers',
  },
  {
    label: 'Wait for approval',
    query: 'approval',
    category: 'approvals',
    description: 'Single-step or chained sign-off',
  },
  {
    label: 'Handle webhooks',
    query: 'webhook',
    category: 'webhooks',
    description: 'Callbacks, polling, claim checks',
  },
  {
    label: 'Route dynamically',
    query: 'route',
    category: 'routing',
    description: 'Routers, slips, detours, filters',
  },
];

function getRecipeCategory(recipe: Recipe): RecipeCategory {
  return slugToCategory[recipe.slug] as RecipeCategory;
}

function getRecipeHref(lang: string, recipe: Recipe) {
  return `/${lang}/cookbook/${getRecipeCategory(recipe)}/${recipe.slug}`;
}

function RecipeCard({
  lang,
  recipe,
  highlighted = false,
  linkRef,
  onFocus,
  onKeyDown,
}: RecipeCardProps) {
  const category = getRecipeCategory(recipe);
  return (
    <Link
      ref={linkRef}
      href={getRecipeHref(lang, recipe)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      data-active={highlighted ? 'true' : 'false'}
      className="group flex min-h-11 flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-muted-foreground/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[active=true]:border-primary data-[active=true]:bg-primary/5"
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
          aria-hidden="true"
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ExplorerMode>(() =>
    readExplorerMode(searchParams)
  );
  const [path, setPath] = useState<PathEntry[]>([]);
  const [query, setQuery] = useState(() => readExplorerQuery(searchParams));
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(() =>
    readExplorerCategory(searchParams)
  );
  const [activeIndex, setActiveIndex] = useState(0);

  // Sync state from URL on popstate / external navigation
  useEffect(() => {
    const nextMode = readExplorerMode(searchParams);
    const nextQuery = readExplorerQuery(searchParams);
    const nextCategory = readExplorerCategory(searchParams);
    setMode((current) => (current === nextMode ? current : nextMode));
    setQuery((current) => (current === nextQuery ? current : nextQuery));
    setSelectedCategory((current) =>
      current === nextCategory ? current : nextCategory
    );
  }, [searchParams]);

  // Push state changes to the URL
  useEffect(() => {
    const currentUrl = buildExplorerUrl(
      pathname,
      readExplorerMode(searchParams),
      readExplorerQuery(searchParams),
      readExplorerCategory(searchParams)
    );
    const nextUrl = buildExplorerUrl(pathname, mode, query, selectedCategory);
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [pathname, router, searchParams, mode, query, selectedCategory]);

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

  const recipeLinkRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const focusRecipe = useCallback(
    (index: number) => {
      if (filteredRecipes.length === 0) return;
      const nextIndex =
        (index + filteredRecipes.length) % filteredRecipes.length;
      setActiveIndex(nextIndex);
      requestAnimationFrame(() => recipeLinkRefs.current[nextIndex]?.focus());
    },
    [filteredRecipes.length]
  );

  const openBrowse = useCallback(
    (next?: Partial<{ query: string; category: CategoryFilter }>) => {
      setMode('browse');
      if (next?.query !== undefined) setQuery(next.query);
      if (next?.category !== undefined) setSelectedCategory(next.category);
      setActiveIndex(0);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    },
    []
  );

  const clearBrowse = useCallback(() => {
    setQuery('');
    setSelectedCategory('all');
    setActiveIndex(0);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeBrowse = useCallback(() => {
    setMode('guided');
    setQuery('');
    setSelectedCategory('all');
    setActiveIndex(0);
  }, []);

  const handleRecipeKeyDown = useCallback(
    (index: number) => (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      if (filteredRecipes.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusRecipe(index + 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusRecipe(index - 1);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        focusRecipe(0);
      }
      if (event.key === 'End') {
        event.preventDefault();
        focusRecipe(filteredRecipes.length - 1);
      }
    },
    [filteredRecipes.length, focusRecipe]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const isInsideExplorer = !!target?.closest?.('[data-cookbook-explorer]');

      if (
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') ||
        (event.key === '/' && !isEditable)
      ) {
        event.preventDefault();
        openBrowse();
        return;
      }

      if (event.key === 'Escape' && isInsideExplorer && mode === 'browse') {
        event.preventDefault();
        if (query || selectedCategory !== 'all') {
          clearBrowse();
        } else {
          closeBrowse();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openBrowse, clearBrowse, closeBrowse, mode, query, selectedCategory]);

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
    <div data-cookbook-explorer>
      {/* Mode switcher */}
      <div
        className="mb-8 flex flex-wrap items-center gap-2"
        aria-label="Cookbook explorer controls"
      >
        <button
          type="button"
          aria-pressed={mode === 'guided'}
          aria-controls="cookbook-guided-panel"
          onClick={() => closeBrowse()}
          className={`min-h-11 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            mode === 'guided'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Guide me
        </button>
        <button
          type="button"
          aria-pressed={mode === 'browse'}
          aria-controls="cookbook-browse-panel"
          onClick={() => openBrowse()}
          className={`min-h-11 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            mode === 'browse'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Browse all
        </button>
        <span className="ml-2 text-xs font-mono text-muted-foreground">
          Press{' '}
          <kbd className="rounded border border-border px-1.5 py-0.5">/</kbd> or{' '}
          <kbd className="rounded border border-border px-1.5 py-0.5">⌘K</kbd> /{' '}
          <kbd className="rounded border border-border px-1.5 py-0.5">
            Ctrl+K
          </kbd>
        </span>
      </div>

      {/* Browse mode */}
      <div id="cookbook-browse-panel" hidden={mode !== 'browse'}>
        <div
          className="mb-4 flex flex-wrap gap-2"
          aria-label="Quick cookbook picks"
        >
          {QUICK_PICKS.map((pick) => (
            <button
              key={pick.label}
              type="button"
              title={pick.description}
              onClick={() =>
                openBrowse({ query: pick.query, category: pick.category })
              }
              className="min-h-11 rounded-full border border-border px-4 py-2 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {pick.label}
            </button>
          ))}
        </div>

        <div className="mb-4 rounded-2xl border border-border bg-card p-4 focus-within:ring-2 focus-within:ring-primary">
          <div className="flex items-center gap-3">
            <svg
              aria-hidden="true"
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
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  if (query || selectedCategory !== 'all') {
                    clearBrowse();
                  } else {
                    closeBrowse();
                  }
                  return;
                }
                if (filteredRecipes.length === 0) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusRecipe(activeIndex);
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusRecipe(filteredRecipes.length - 1);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  focusRecipe(0);
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  focusRecipe(filteredRecipes.length - 1);
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  openRecipe(filteredRecipes[activeIndex]);
                }
              }}
              placeholder="Search recipes, use cases, or slugs"
              aria-label="Search cookbook recipes"
              aria-describedby="cookbook-search-help cookbook-search-status"
              autoComplete="off"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <p id="cookbook-search-help" className="sr-only">
            Type to filter recipes. Press Arrow Down to move into the results.
            Press Enter to open the highlighted recipe.
          </p>
          <p id="cookbook-search-status" className="sr-only" aria-live="polite">
            {filteredRecipes.length} of {recipeCount} recipes shown.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`min-h-11 rounded-full border px-4 py-2 text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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
                aria-pressed={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={`min-h-11 rounded-full border px-4 py-2 text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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

        <p className="mb-6 text-sm text-muted-foreground" aria-live="polite">
          {filteredRecipes.length} of {recipeCount} recipes. Use
          &nbsp;&uarr;/&darr; to move and Enter to open the highlighted result.
        </p>

        {filteredRecipes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No recipes match <span className="font-mono">{query}</span>. Try a
            broader term like <span className="font-mono">retry</span>,{' '}
            <span className="font-mono">approval</span>, or{' '}
            <span className="font-mono">webhook</span>.
          </div>
        ) : (
          <ul className="grid gap-4" aria-label="Cookbook search results">
            {filteredRecipes.map((recipe, index) => (
              <li key={recipe.slug}>
                <RecipeCard
                  lang={lang}
                  recipe={recipe}
                  highlighted={index === activeIndex}
                  linkRef={(node) => {
                    recipeLinkRefs.current[index] = node;
                  }}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={handleRecipeKeyDown(index)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Guided mode */}
      <div id="cookbook-guided-panel" hidden={mode !== 'guided'}>
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
                {recipeCount} recipes, or switch to <strong>Browse all</strong>{' '}
                if you already know roughly what you want.
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
                <RecipeCard key={recipe.slug} lang={lang} recipe={recipe} />
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
    </div>
  );
}
