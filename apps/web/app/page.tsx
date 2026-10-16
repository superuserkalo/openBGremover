import Link from "next/link";
import { AgentConnect } from "@/components/marketing/agent-connect";
import { Announcement } from "@/components/marketing/announcement";
import {
  Code2,
  ArrowRight,
  ArrowUpRight,
  Image as ImageIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PixelField } from "@/components/marketing/pixel-field";
import { CodeExample } from "@/components/marketing/code-example";
import { Faq } from "@/components/marketing/faq";
import {
  BackgroundRemovalDemo,
  ImageComparison,
} from "@/components/background-removal-demo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mediaOperations } from "@/lib/media-operations";

function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-20 items-center gap-5 border-y border-border px-6 font-mono text-xs text-muted-foreground sm:px-10">
      <span className="text-primary">[ {number} / 04 ]</span>
      <span>{children}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Announcement />
      <SiteHeader />
      <main
        id="main-content"
        className="mx-auto max-w-7xl border-x border-border"
      >
        <section className="relative isolate overflow-hidden border-b border-border">
          <PixelField />
          <div className="relative grid min-h-165 items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:px-12 lg:py-24">
            <div className="flex flex-col items-start gap-7">
              <h1 className="text-[43px] leading-[1.07] font-semibold tracking-[-0.055em] sm:text-6xl lg:text-[66px]">
                Give your agents
                <br />
                <span className="text-primary">media tools</span>
              </h1>
              <p className="max-w-100 text-lg leading-relaxed text-muted-foreground">
                Turn image inputs into ready-to-use assets. One API for your
                apps and agents.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Start for free
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <AgentConnect />
              </div>
            </div>
            <div className="min-w-0">
              <BackgroundRemovalDemo />
            </div>
          </div>
        </section>
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border lg:grid-cols-4">
          {[
            { label: "Background removal", detail: "Ready to use" },
            { label: "Soft alpha", detail: "Transparent PNG output" },
            { label: "Full resolution", detail: "No browser downscaling" },
            { label: "One HTTP API", detail: "For apps and agents" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-2 border-b border-border px-6 py-8 lg:border-b-0 lg:px-10"
            >
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-xs text-muted-foreground">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
        <div className="h-20 sm:h-28" />
        <SectionLabel number="01">MEDIA TOOLS</SectionLabel>
        <section id="products" className="scroll-mt-24">
          <div className="relative overflow-hidden px-6 py-18 text-center sm:py-24">
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-4xl leading-[1.1] font-semibold tracking-[-0.045em] sm:text-5xl">
                Your media.
                <br />
                Ready for <span className="text-primary">what comes next.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
                Remove backgrounds, compress, upscale, convert, and extract
                text. Media tools for your apps and agents.
              </p>
            </div>
          </div>
          <div className="grid border-t border-border md:grid-cols-2 lg:grid-cols-5">
            {mediaOperations.map((item) => (
              <Link
                href={`/playground?tool=${item.id}`}
                key={item.id}
                className="group relative flex flex-col items-start gap-5 border-b border-border p-7 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-primary md:border-r lg:p-8"
              >
                <item.icon className="size-6 text-primary transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transform-none" />
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-medium">{item.name}</h3>
                </div>
                <p className="min-h-12 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <span className="mt-auto flex items-center gap-2 text-sm text-primary">
                  Explore tool
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
                <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-primary transition-transform group-hover:scale-x-100" />
              </Link>
            ))}
          </div>
        </section>
        <div className="h-20 sm:h-28" />
        <SectionLabel number="02">BUILT FOR YOUR WORKFLOW</SectionLabel>
        <section>
          <div className="px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
            <div>
              <h2 className="text-4xl leading-[1.1] font-semibold tracking-[-0.045em] sm:text-5xl">
                From upload to output.
                <br />
                <span className="text-primary">One API call.</span>
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Send an image. Get the result. Use the same authenticated
                endpoint in your product, scripts, or agent workflow.
              </p>
            </div>
          </div>
          <CodeExample />
        </section>
        <div className="h-20 sm:h-28" />
        <SectionLabel number="03">THE DETAILS MATTER</SectionLabel>
        <section className="grid border-b border-border lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-7 p-7 sm:p-12">
            <h2 className="text-4xl leading-[1.1] font-semibold tracking-[-0.045em] sm:text-5xl">
              Keep the details.
              <br />
              <span className="text-primary">Lose the background.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              Soft edges stay soft. PNG and WebP preserve transparency, so your
              subject is ready for a new setting.
            </p>
            <div className="flex flex-wrap gap-2">
              {["PNG", "WebP", "JPEG", "GIF"].map((format) => (
                <Badge key={format} variant="outline">
                  {format}
                </Badge>
              ))}
            </div>
            <Button variant="outline" className="self-start" asChild>
              <Link href="/playground">
                Try your image
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          <div className="border-t border-border p-6 sm:p-10 lg:border-t-0 lg:border-l">
            <ImageComparison
              original="/examples/astronaut.png"
              result="/examples/astronaut-removed.png"
              label="NASA astronaut portrait, before and after background removal"
            />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Drag to compare. NASA public-domain image, processed with
              openBGremover.
            </p>
          </div>
        </section>
        <section className="grid divide-y divide-border border-b border-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-8 sm:p-12">
            <ImageIcon className="mb-6 size-5 text-primary" />
            <h3 className="mb-3 text-xl font-medium tracking-tight">
              Bring the original.
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">
              Upload the source image at its original resolution. Files up to 10
              MB and 25 megapixels are supported.
            </p>
          </div>
          <div className="p-8 sm:p-12">
            <Code2 className="mb-6 size-5 text-primary" />
            <h3 className="mb-3 text-xl font-medium tracking-tight">
              Build on an API you can inspect.
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">
              Read the implementation, connect your own client, and make image
              processing part of your workflow.
            </p>
            <a
              href="https://github.com/superuserkalo/openBGremover"
              className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              Explore the source
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </section>
        <div className="h-20 sm:h-28" />
        <section className="relative isolate overflow-hidden border-y border-border px-6 py-20 text-center sm:py-28">
          <PixelField />
          <div className="relative">
            <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Try your first image.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Drop it in the playground. Take the result anywhere.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/playground">
                  Open playground
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </section>
        <div className="h-20 sm:h-28" />
        <SectionLabel number="04">FAQ</SectionLabel>
        <section className="grid border-b border-border lg:grid-cols-2">
          <div className="p-8 sm:p-12">
            <h2 className="text-4xl leading-[1.1] font-semibold tracking-[-0.045em] sm:text-5xl">
              A few good
              <br />
              <span className="text-primary">questions.</span>
            </h2>
            <p className="mt-6 text-base text-muted-foreground">
              What to know before your first upload.
            </p>
          </div>
          <div className="border-t border-border lg:border-t-0 lg:border-l">
            <Faq />
          </div>
        </section>
        <div className="h-20 sm:h-28" />
      </main>
      <SiteFooter />
    </>
  );
}
