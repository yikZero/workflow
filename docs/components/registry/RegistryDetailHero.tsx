import { ChevronRight, ExternalLink, Github, Home } from 'lucide-react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import type { RegistryItem } from '@/lib/registry/types';
import { getProviderLogo } from './logos';

interface RegistryDetailHeroProps {
  item: RegistryItem;
}

export function RegistryDetailHero({ item }: RegistryDetailHeroProps) {
  const Logo = getProviderLogo(item.logo);

  return (
    <section className="space-y-6 pt-8 sm:pt-12 pb-8 border-b">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/registry">Registry</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{item.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-8 lg:gap-12">
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-4">
            {Logo && (
              <div
                aria-hidden="true"
                className="flex h-14 min-w-14 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground px-3"
              >
                <Logo size={28} />
              </div>
            )}
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {item.name}
            </h1>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {item.shadcnSlug}
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl">
            {item.description}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs font-normal py-0.5 px-2"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <a
            href={item.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4 shrink-0" />
            <span>Homepage</span>
          </a>
          {item.docsUrl && (
            <a
              href={item.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>Provider docs</span>
            </a>
          )}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4 shrink-0" />
              <span>Source</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
