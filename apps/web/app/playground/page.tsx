import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { MediaStage } from "@/components/marketing/media-stage-field";
import { BackgroundRemovalDemo } from "@/components/background-removal-demo";
import { CodeExample } from "@/components/marketing/code-example";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Remove backgrounds, compress images, and convert between JPEG, PNG, and WebP. Preview and download your result.",
};

async function PlaygroundTool({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const { tool } = await searchParams;

  return (
    <BackgroundRemovalDemo
      key={tool ?? "remove"}
      initialTool={tool ?? "remove"}
    />
  );
}

export default function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl border-x border-border">
        <section className="relative isolate overflow-hidden border-b border-border px-6 py-16 text-center">
          <MediaStage />
          <div data-stage-calm className="relative">
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Playground
            </h1>
            <p className="mt-5 text-base text-muted-foreground">
              Your image, the result, and the API. All in one place.
            </p>
          </div>
        </section>
        <section
          aria-label="Image processing playground"
          className="px-5 py-12 sm:px-10 sm:py-16"
        >
          <div className="mx-auto max-w-2xl">
            <Suspense fallback={<Skeleton className="h-100 w-full" />}>
              <PlaygroundTool searchParams={searchParams} />
            </Suspense>
          </div>
        </section>
        <section className="border-t border-border">
          <div className="px-7 py-10 sm:px-10">
            <h2 className="text-2xl font-medium tracking-tight">
              Take it into your app
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Choose your language. Send an image. Save the result.
            </p>
          </div>
          <CodeExample />
        </section>
        <div className="h-20" />
      </main>
      <SiteFooter />
    </>
  );
}
