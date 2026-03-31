import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CookbookExplorer } from '@/components/geistdocs/cookbook-explorer';
import {
  rewriteCookbookUrl,
  rewriteCookbookUrlsInText,
} from '@/lib/geistdocs/cookbook-source';
import { AskAI } from '@/components/geistdocs/ask-ai';
import { CopyPage } from '@/components/geistdocs/copy-page';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from '@/components/geistdocs/docs-page';
import { EditSource } from '@/components/geistdocs/edit-source';
import { Feedback } from '@/components/geistdocs/feedback';
import { getMDXComponents } from '@/components/geistdocs/mdx-components';
import { OpenInChat } from '@/components/geistdocs/open-in-chat';
import { ScrollTop } from '@/components/geistdocs/scroll-top';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getLLMText, getPageImage, source } from '@/lib/geistdocs/source';

const Page = async ({ params }: PageProps<'/[lang]/cookbooks/[[...slug]]'>) => {
  const { slug, lang } = await params;

  // Prepend 'cookbook' to resolve from the docs source
  const resolvedSlug = slug ? ['cookbook', ...slug] : ['cookbook'];
  const page = source.getPage(resolvedSlug, lang);

  if (!page) {
    notFound();
  }

  const publicUrl = rewriteCookbookUrl(page.url);
  const publicPage = { ...page, url: publicUrl } as typeof page;

  const markdown = rewriteCookbookUrlsInText(await getLLMText(page));
  const MDX = page.data.body;

  return (
    <DocsPage
      full={page.data.full}
      tableOfContent={{
        style: 'clerk',
        footer: (
          <div className="my-3 space-y-3">
            <Separator />
            <EditSource path={page.path} />
            <ScrollTop />
            <Feedback />
            <CopyPage text={markdown} />
            <AskAI href={publicUrl} />
            <OpenInChat href={publicUrl} />
          </div>
        ),
      }}
      toc={page.data.toc}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, publicPage),
            Badge,
            Step,
            Steps,
            Tabs,
            Tab,
            CookbookExplorer: () => <CookbookExplorer lang={lang} />,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
};

export const generateStaticParams = () => {
  // Generate params for all cookbook pages
  const allParams = source.generateParams();
  return allParams
    .filter((p) => Array.isArray(p.slug) && p.slug[0] === 'cookbook')
    .map((p) => ({
      ...p,
      slug: (p.slug as string[]).slice(1), // Remove 'cookbook' prefix
    }));
};

export const generateMetadata = async ({
  params,
}: PageProps<'/[lang]/cookbooks/[[...slug]]'>) => {
  const { slug, lang } = await params;
  const resolvedSlug = slug ? ['cookbook', ...slug] : ['cookbook'];
  const page = source.getPage(resolvedSlug, lang);

  if (!page) {
    notFound();
  }

  const publicPath = rewriteCookbookUrl(page.url);

  const metadata: Metadata = {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
    alternates: {
      canonical: publicPath,
      types: {
        'text/markdown': `${publicPath}.md`,
      },
    },
  };

  return metadata;
};

export default Page;
