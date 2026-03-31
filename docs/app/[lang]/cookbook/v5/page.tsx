'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  categoryLabels,
  collectSlugs,
  getRecipeHref,
  recipes,
  tree,
  type RecipeCategory,
} from '@/lib/cookbook-tree';

type ScenarioGroup = {
  label: string;
  icon: string;
  items: { slug: string; whenToUse: string; title: string }[];
};

const scenarioGroups: ScenarioGroup[] = tree.branches.map((branch) => {
  const slugs = collectSlugs(branch);
  return {
    label: branch.label,
    icon: branch.icon,
    items: slugs
      .map((slug) => {
        const r = recipes[slug];
        return r ? { slug, whenToUse: r.whenToUse, title: r.title } : null;
      })
      .filter(Boolean) as ScenarioGroup['items'],
  };
});

export default function ProblemSolutionPage() {
  const { lang } = useParams<{ lang: string }>();
  const [query, setQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return scenarioGroups;
    const lower = query.toLowerCase();
    return scenarioGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.whenToUse.toLowerCase().includes(lower) ||
            item.title.toLowerCase().includes(lower) ||
            item.slug.toLowerCase().includes(lower)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  const selectedRecipe = selectedSlug ? recipes[selectedSlug] : null;

  const totalVisible = filteredGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookbook</h1>
        <p className="text-muted-foreground">
          Browse by the problem you&rsquo;re solving. Select a scenario to see
          the matching recipe.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: scenario index */}
        <div className="space-y-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter scenarios..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {totalVisible} scenario{totalVisible !== 1 ? 's' : ''}
          </p>

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No scenarios match your filter.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredGroups.map((group) => (
                <section key={group.label}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <span>{group.icon}</span>
                    {group.label}
                  </h2>
                  <div className="space-y-0">
                    {group.items.map((item, i) => (
                      <div key={item.slug}>
                        {i > 0 && <Separator />}
                        <button
                          type="button"
                          onClick={() => setSelectedSlug(item.slug)}
                          className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                            selectedSlug === item.slug
                              ? 'bg-primary/5 border-l-2 border-primary'
                              : 'hover:bg-accent'
                          }`}
                        >
                          <span className="block text-sm">
                            {item.whenToUse}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                            {item.title}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {selectedRecipe ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {categoryLabels[selectedRecipe.category as RecipeCategory]}
                  </Badge>
                </div>
                <CardTitle>{selectedRecipe.title}</CardTitle>
                <CardDescription>{selectedRecipe.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    When to use
                  </p>
                  <p className="text-sm">{selectedRecipe.whenToUse}</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild size="sm" className="w-full gap-1.5">
                  <Link href={getRecipeHref(lang, selectedRecipe.slug)}>
                    View full recipe
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Select a scenario to see recipe details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
