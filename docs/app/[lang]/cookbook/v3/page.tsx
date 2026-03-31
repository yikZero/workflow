import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import {
  categoryLabels,
  categoryOrder,
  getRecipeHref,
  getRecipesByCategory,
  recipes,
  type RecipeCategory,
} from '@/lib/cookbook-tree';

const totalCount = Object.keys(recipes).length;

const Page = async ({ params }: PageProps<'/[lang]/cookbook/v3'>) => {
  const { lang } = await params;

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookbook</h1>
        <p className="text-muted-foreground">
          {totalCount} workflow recipes organized by category. Expand a section
          to explore patterns and find the right fit.
        </p>
      </header>

      <Accordion type="multiple" className="w-full">
        {categoryOrder.map((cat) => {
          const catRecipes = getRecipesByCategory(cat);
          return (
            <AccordionItem key={cat} value={cat}>
              <AccordionTrigger className="text-base">
                <span className="flex items-center gap-3">
                  {categoryLabels[cat]}
                  <Badge variant="outline" className="text-xs">
                    {catRecipes.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-0">
                  {catRecipes.map((recipe, i) => (
                    <div key={recipe.slug}>
                      {i > 0 && <Separator className="my-3" />}
                      <Link
                        href={getRecipeHref(lang, recipe.slug)}
                        className="group block rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-medium">
                            {recipe.title}
                          </span>
                          <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {recipe.description}
                        </p>
                        <p className="mt-1 text-xs italic text-muted-foreground/70">
                          When to use: {recipe.whenToUse}
                        </p>
                      </Link>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default Page;
