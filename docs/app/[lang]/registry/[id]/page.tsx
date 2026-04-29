import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { codeToHtml } from 'shiki';
import { RegistryCodeTabs } from '@/components/registry/RegistryCodeTabs';
import { RegistryDetailHero } from '@/components/registry/RegistryDetailHero';
import { RegistryInstallTabs } from '@/components/registry/RegistryInstallTabs';
import { Button } from '@/components/ui/button';
import { getRegistryItem, getRegistryItemIds } from '@/lib/registry/manifest';

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return getRegistryItemIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const item = getRegistryItem(id);
  if (!item) return { title: 'Registry item not found' };
  return {
    title: `${item.name} | Workflow Registry`,
    description: item.description,
  };
}

export default async function RegistryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const item = getRegistryItem(id);
  if (!item) notFound();

  // Pre-render every snippet on the server with shiki, then hand the HTML to
  // the client tabs component. This keeps the heavy syntax-highlighting work
  // off the client bundle.
  const blocks = await Promise.all(
    item.snippets.map(async (snippet) => ({
      label: snippet.label,
      caption: snippet.caption,
      html: await codeToHtml(snippet.code, {
        lang: snippet.lang,
        themes: {
          light: 'github-light-default',
          dark: 'github-dark-default',
        },
        defaultColor: false,
      }),
    }))
  );

  return (
    <div className="[&_h1]:tracking-tighter [&_h2]:tracking-tighter [&_h3]:tracking-tighter">
      <div className="mx-auto w-full max-w-[1080px] px-4">
        <div className="mt-[var(--fd-nav-height)]">
          <RegistryDetailHero item={item} />
        </div>

        <div className="py-10 sm:py-12 space-y-12">
          {/* Long-form description */}
          {item.longDescription && (
            <section className="max-w-3xl">
              <p className="text-muted-foreground leading-relaxed">
                {item.longDescription}
              </p>
            </section>
          )}

          {/* Installation */}
          <section className="space-y-3">
            <h2 className="font-semibold text-2xl tracking-tight">
              Installation
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Run the command for your package manager. The shadcn CLI copies
              every file in this recipe into your project — you own the code
              after install and can customize it freely.
            </p>
            <RegistryInstallTabs slug={item.shadcnSlug} />
          </section>

          {/* Environment variables */}
          {item.envVars && item.envVars.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-2xl tracking-tight">
                Environment
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Add the following to your <code>.env</code>:
              </p>
              <div className="space-y-3">
                {item.envVars.map((envVar) => (
                  <div
                    key={envVar.name}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-background p-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <code className="font-mono text-sm text-foreground">
                        {envVar.name}
                        {envVar.exampleValue && (
                          <span className="text-muted-foreground">
                            ={envVar.exampleValue}
                          </span>
                        )}
                      </code>
                      <p className="text-sm text-muted-foreground">
                        {envVar.description}
                      </p>
                    </div>
                    {envVar.getKeyUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={envVar.getKeyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5"
                        >
                          Get API key
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Files installed */}
          <section className="space-y-3">
            <h2 className="font-semibold text-2xl tracking-tight">
              What gets installed
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              These files land in your project. Edit them however you want — the
              shadcn CLI never touches them again.
            </p>
            <ul className="space-y-2">
              {item.files.map((file) => (
                <li
                  key={file.path}
                  className="rounded-md border bg-background p-3 sm:p-4 space-y-1"
                >
                  <code className="font-mono text-sm text-foreground">
                    {file.path}
                  </code>
                  <p className="text-sm text-muted-foreground">
                    {file.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Source preview */}
          <section className="space-y-3">
            <h2 className="font-semibold text-2xl tracking-tight">Source</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              A preview of the code that gets copied into your app.
            </p>
            <RegistryCodeTabs blocks={blocks} />
          </section>
        </div>
      </div>
    </div>
  );
}
