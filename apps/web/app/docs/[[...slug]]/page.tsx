import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle, MarkdownCopyButton } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/docs/mdx";
import { docsSource } from "@/lib/docs-source";

type DocumentationPageProps = { params: Promise<{ slug?: string[] }> };

export default async function DocumentationPage({ params }: DocumentationPageProps) {
  const { slug } = await params;
  const page = docsSource.getPage(slug);

  if (!page) notFound();

  const Content = page.data.body;

  return (
    <DocsPage toc={page.data.toc} breadcrumb={{ includeRoot: { url: "/docs" }, includePage: true }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="mb-6 border-y border-fd-border py-2">
        <MarkdownCopyButton markdownUrl={page.url === "/docs" ? "/docs/index.md" : `${page.url}.md`} />
      </div>
      <DocsBody><Content components={getMDXComponents()} /></DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const page = docsSource.getPage((await params).slug);

  if (!page) notFound();

  return { title: page.data.title, description: page.data.description };
}
