import type { NextRequest } from 'next/server';
import { getLLMText, source } from '@/lib/geistdocs/source';

const COOKBOOK_URL_RE_GLOBAL = /\/docs\/cookbook(?=\/|$)/g;

export const revalidate = false;

export const GET = async (
  _req: NextRequest,
  { params }: RouteContext<'/[lang]/llms.txt'>
) => {
  const { lang } = await params;
  const scan = source.getPages(lang).map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(
    scanned.join('\n\n').replace(COOKBOOK_URL_RE_GLOBAL, '/cookbooks'),
    {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    }
  );
};
