'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { categoryLabels } from '@/lib/registry/manifest';
import type { RegistryCategory, RegistryItem } from '@/lib/registry/types';
import { RegistryCard } from './RegistryCard';

type Filter = 'all' | RegistryCategory;

interface RegistryGridProps {
  items: RegistryItem[];
}

export function RegistryGrid({ items }: RegistryGridProps) {
  const [filter, setFilter] = useState<Filter>('all');

  // Build the list of category filters dynamically — only the categories that
  // actually have items get a chip.
  const presentCategories = Array.from(
    new Set(items.map((item) => item.category))
  );

  const filtered =
    filter === 'all' ? items : items.filter((item) => item.category === filter);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Show all', count: items.length },
    ...presentCategories.map((category) => ({
      id: category as Filter,
      label: categoryLabels[category],
      count: items.filter((item) => item.category === category).length,
    })),
  ];

  return (
    <>
      <div className="border-y px-4 py-6">
        <div className="flex flex-wrap justify-center gap-3">
          {filters.map(({ id, label, count }) => (
            <Badge
              key={id}
              variant="outline"
              className={`text-sm font-normal py-1 px-3 cursor-pointer select-none ${
                filter === id
                  ? 'bg-gray-1000 text-background-100 border-transparent'
                  : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() => setFilter(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilter(id);
                }
              }}
            >
              {label} ({count})
            </Badge>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No registry items match this filter.
        </p>
      ) : (
        <section className="px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <RegistryCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
