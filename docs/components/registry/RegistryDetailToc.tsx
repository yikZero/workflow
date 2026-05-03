'use client';

import { SiGithub } from '@icons-pack/react-simple-icons';
import { useEffect, useState } from 'react';
import { AskAI } from '@/components/geistdocs/ask-ai';
import { CopyPage } from '@/components/geistdocs/copy-page';
import { Feedback } from '@/components/geistdocs/feedback';
import { OpenInChat } from '@/components/geistdocs/open-in-chat';
import { ScrollTop } from '@/components/geistdocs/scroll-top';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface RegistryTocItem {
  id: string;
  title: string;
  depth?: number;
}

interface RegistryDetailTocProps {
  items: RegistryTocItem[];
  pageText: string;
  href: string;
  githubPath?: string;
}

export function RegistryDetailToc({
  items,
  pageText,
  href,
  githubPath,
}: RegistryDetailTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px', threshold: 0 }
    );

    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const githubEditUrl = githubPath
    ? `https://github.com/vercel/workflow/edit/main/docs/lib/registry/${githubPath}`
    : undefined;

  return (
    <div>
      <p className="font-medium text-sm mb-3">On this page</p>
      <nav className="space-y-0.5">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={cn(
              'block text-sm py-1 border-l-2 transition-colors',
              item.depth === 3 ? 'pl-7' : 'pl-3',
              activeId === item.id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            )}
          >
            {item.title}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-3">
        <Separator />
        {githubEditUrl && (
          <a
            className="flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href={githubEditUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <SiGithub className="size-3.5" />
            <span>Edit this page on GitHub</span>
          </a>
        )}
        <ScrollTop />
        <Feedback />
        <CopyPage text={pageText} />
        <AskAI href={href} />
        <OpenInChat href={href} />
      </div>
    </div>
  );
}
