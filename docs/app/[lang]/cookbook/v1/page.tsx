import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  categoryLabels,
  categoryOrder,
  getRecipeHref,
  getRecipesByCategory,
  recipes,
  type RecipeCategory,
} from '@/lib/cookbook-tree';

const totalCount = Object.keys(recipes).length;

const Page = async ({ params }: PageProps<'/[lang]/cookbook/v1'>) => {
  const { lang } = await params;

  return (
    <div className="space-y-12 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookbook</h1>
        <p className="text-muted-foreground">
          {totalCount} recipes across {categoryOrder.length} categories. Find
          the right workflow pattern for your use case.
        </p>
      </header>

      <nav aria-label="Category navigation" className="flex flex-wrap gap-2">
        {categoryOrder.map((cat) => (
          <a key={cat} href={`#${cat}`} className="inline-flex">
            <Badge variant="outline">
              {categoryLabels[cat]}{' '}
              <span className="ml-1 text-muted-foreground">
                {getRecipesByCategory(cat).length}
              </span>
            </Badge>
          </a>
        ))}
      </nav>

      {categoryOrder.map((cat) => {
        const catRecipes = getRecipesByCategory(cat);
        return (
          <section key={cat} id={cat} className="scroll-mt-20 space-y-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold">{categoryLabels[cat]}</h2>
              <span className="text-sm text-muted-foreground">
                {catRecipes.length} recipes
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catRecipes.map((recipe) => (
                <Link
                  key={recipe.slug}
                  href={getRecipeHref(lang, recipe.slug)}
                  className="group"
                >
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardHeader>
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
          </section>
        );
      })}
    </div>
  );
};

export default Page;
