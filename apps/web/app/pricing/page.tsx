import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-7xl border-x border-border">
        <header className="border-b border-border px-6 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
            Start with <span className="text-primary">an image.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground">
            Try background removal in the playground. Paid plans are not
            available yet.
          </p>
        </header>
        <div className="mx-auto grid max-w-4xl gap-0 px-6 py-16 md:grid-cols-2">
          <section className="flex flex-col gap-6 border border-border bg-card p-8 sm:p-10">
            <Badge variant="secondary" className="self-start">
              Available now
            </Badge>
            <h2 className="text-2xl font-medium">Public playground</h2>
            <p className="text-5xl font-semibold tracking-tight">Free</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Try an image before connecting the API. No account required.
            </p>
            <ul className="flex flex-col gap-4 text-sm">
              {[
                "Background removal",
                "Transparent PNG download",
                "Full-resolution uploads",
                "Rate-limited public demo",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="size-4 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <Button size="lg" asChild className="mt-auto">
              <Link href="/playground">
                Try an image
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </section>
          <section className="flex flex-col gap-6 border border-border p-8 sm:p-10">
            <Badge variant="outline" className="self-start">
              For your app
            </Badge>
            <h2 className="text-2xl font-medium">API access</h2>
            <p className="text-2xl font-medium">Build with your account</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create an API key and check your available credits in the
              dashboard. Existing credits can be used for processing.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Checkout is not enabled. Paid pricing will be published when
              purchases are available.
            </p>
            <Button size="lg" variant="outline" asChild className="mt-auto">
              <Link href="/signup">
                Create an account
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
