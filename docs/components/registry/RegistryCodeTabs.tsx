'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RegistryCodeTabsProps {
  blocks: {
    label: string;
    caption?: string;
    /** Pre-rendered shiki HTML — generated on the server. */
    html: string;
  }[];
}

export function RegistryCodeTabs({ blocks }: RegistryCodeTabsProps) {
  if (blocks.length === 0) return null;

  return (
    <Tabs defaultValue={blocks[0].label} className="w-full">
      <TabsList className="h-10 gap-1 p-1">
        {blocks.map((b) => (
          <TabsTrigger
            key={b.label}
            value={b.label}
            className="flex-none px-3.5 py-1.5"
          >
            {b.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {blocks.map((b) => (
        <TabsContent key={b.label} value={b.label} className="space-y-2">
          {b.caption && (
            <p className="text-xs font-mono text-muted-foreground">
              {b.caption}
            </p>
          )}
          <div
            className="overflow-auto text-sm rounded-md border bg-background [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:m-0"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki produces safe HTML
            dangerouslySetInnerHTML={{ __html: b.html }}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
