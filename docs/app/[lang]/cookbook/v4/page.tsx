'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRightIcon, ChevronRightIcon, RotateCcwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  type Branch,
  type TreeNode,
  getRecipeHref,
  recipes,
  tree,
} from '@/lib/cookbook-tree';

type PathEntry = { node: TreeNode; branchIndex: number };

function countSlugs(branch: Branch): number {
  const direct = branch.slugs?.length ?? 0;
  if (branch.next) {
    return direct + branch.next.branches.reduce((n, b) => n + countSlugs(b), 0);
  }
  return direct;
}

export default function WizardPage() {
  const { lang } = useParams<{ lang: string }>();
  const [path, setPath] = useState<PathEntry[]>([]);

  const currentNode = useMemo(() => {
    let node = tree;
    for (const entry of path) {
      const branch = node.branches[entry.branchIndex];
      if (branch.next) {
        node = branch.next;
      }
    }
    return node;
  }, [path]);

  const lastBranch = path.length > 0 ? path[path.length - 1] : null;

  const terminalSlugs = useMemo(() => {
    if (path.length === 0) return null;
    const branch = (() => {
      let node = tree;
      for (let i = 0; i < path.length; i++) {
        const b = node.branches[path[i].branchIndex];
        if (i === path.length - 1) return b;
        if (b.next) node = b.next;
      }
      return null;
    })();
    if (!branch) return null;
    if (branch.slugs && !branch.next) return branch.slugs;
    return null;
  }, [path]);

  const showQuestion = terminalSlugs === null;

  function selectBranch(index: number) {
    setPath([...path, { node: currentNode, branchIndex: index }]);
  }

  function goToStep(stepIndex: number) {
    setPath(path.slice(0, stepIndex));
  }

  function reset() {
    setPath([]);
  }

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookbook</h1>
        <p className="text-muted-foreground">
          Answer a few questions and we&rsquo;ll point you to the right recipe.
        </p>
      </header>

      {/* Breadcrumb trail */}
      {path.length > 0 && (
        <nav
          aria-label="Wizard progress"
          className="flex flex-wrap items-center gap-1.5 text-sm"
        >
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Start
          </button>
          {path.map((entry, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRightIcon className="size-3 text-muted-foreground" />
              <button
                type="button"
                onClick={() => goToStep(i + 1)}
                className={`transition-colors ${
                  i === path.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {entry.node.branches[entry.branchIndex].label}
              </button>
            </span>
          ))}
        </nav>
      )}

      {/* Question */}
      {showQuestion && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">{currentNode.question}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {currentNode.branches.map((branch, i) => {
              const count = countSlugs(branch);
              const hasNext = !!branch.next;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectBranch(i)}
                  className="group flex items-start gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                    {branch.icon}
                  </span>
                  <div className="flex-1 space-y-1">
                    <span className="font-medium text-sm">{branch.label}</span>
                    <span className="block text-xs text-muted-foreground font-mono">
                      {hasNext
                        ? 'More choices'
                        : `${count} recipe${count !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <ChevronRightIcon className="mt-0.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {terminalSlugs && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Here&rsquo;s what fits{' '}
              <span className="text-muted-foreground font-normal text-base">
                ({terminalSlugs.length} recipe
                {terminalSlugs.length !== 1 ? 's' : ''})
              </span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="gap-1.5"
            >
              <RotateCcwIcon className="size-3.5" />
              Start over
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {terminalSlugs.map((slug) => {
              const recipe = recipes[slug];
              if (!recipe) return null;
              return (
                <Link
                  key={slug}
                  href={getRecipeHref(lang, slug)}
                  className="group"
                >
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-sm">
                        {recipe.title}
                        <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </CardTitle>
                      <CardDescription>{recipe.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
