import { notFound } from "next/navigation";
import { docsSource } from "@/lib/docs-source";

export const dynamic = "force-static";

type MarkdownRouteContext = { params: Promise<{ slug?: string[] }> };

export async function GET(_request: Request, { params }: MarkdownRouteContext) {
  const page = docsSource.getPage((await params).slug);

  if (!page) notFound();

  return new Response(await page.data.getText("raw"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return docsSource.generateParams();
}
