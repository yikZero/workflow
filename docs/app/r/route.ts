/**
 * /r — shadcn-compatible registry index endpoint.
 *
 * Returns the full registry in the shadcn registry.json schema so the CLI
 * can discover all available patterns:
 *
 *   pnpm dlx shadcn@latest add https://workflow-sdk.dev/r
 *
 * Each item in the index links to /r/[name] for the full file payload.
 */

import { NextResponse } from 'next/server';
import { registryItems } from '@/lib/registry/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = registryItems.map((item) => ({
    name: item.id,
    type: 'registry:lib' as const,
    title: item.name,
    description: item.description,
    registryDependencies: [],
    tags: item.tags,
    categories: item.categories,
  }));

  const registryIndex = {
    $schema: 'https://ui.shadcn.com/schema/registry.json',
    name: 'workflow-sdk',
    homepage: 'https://workflow-sdk.dev',
    items,
  };

  return NextResponse.json(registryIndex, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
