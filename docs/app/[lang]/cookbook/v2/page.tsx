'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  categoryLabels,
  categoryOrder,
  getRecipeHref,
  getRecipesByCategory,
  recipes,
  type RecipeCategory,
} from '@/lib/cookbook-tree';

const allRecipes = Object.values(recipes);
const totalCount = allRecipes.length;

function matchesQuery(recipe: (typeof allRecipes)[number], q: string): boolean {
  const lower = q.toLowerCase();
  return (
    recipe.title.toLowerCase().includes(lower) ||
    recipe.slug.toLowerCase().includes(lower) ||
    recipe.description.toLowerCase().includes(lower) ||
    recipe.whenToUse.toLowerCase().includes(lower) ||
    categoryLabels[recipe.category as RecipeCategory]
      .toLowerCase()
      .includes(lower)
  );
}

export default function SearchFirstPage() {
  const { lang } = useParams<{ lang: string }>();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let results = allRecipes;
    if (selectedCategory) {
      results = results.filter((r) => r.category === selectedCategory);
    }
    if (query.trim()) {
      results = results.filter((r) => matchesQuery(r, query.trim()));
    }
    return results;
  }, [query, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const base = query.trim()
      ? allRecipes.filter((r) => matchesQuery(r, query.trim()))
      : allRecipes;
    const counts: Record<string, number> = {};
    for (const cat of categoryOrder) {
      counts[cat] = base.filter((r) => r.category === cat).length;
    }
    counts.__all = base.length;
    return counts;
  }, [query]);

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookbook</h1>
        <p className="text-muted-foreground">
          Search {totalCount} workflow recipes to find the right pattern.
        </p>
      </header>

      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="What are you building? e.g. retry, webhook, approval..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 text-base"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              selectedCategory === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            All {categoryCounts.__all}
          </button>
          {categoryOrder.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setSelectedCategory(selectedCategory === cat ? null : cat)
              }
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {categoryLabels[cat]} {categoryCounts[cat]}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="text-sm text-muted-foreground">
        Showing {filtered.length} of {totalCount} recipes
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No recipes match your search. Try a different term or clear the
          filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <Link
              key={recipe.slug}
              href={getRecipeHref(lang, recipe.slug)}
              className="group"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {categoryLabels[recipe.category as RecipeCategory]}
                    </Badge>
                  </div>
                  <CardTitle className="flex items-center justify-between text-sm">
                    {recipe.title}
                    <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {recipe.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
