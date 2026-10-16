import { MediaMark } from "@/components/brand/media-mark";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-7xl border-x border-border">
      <div className="grid border-t border-border md:grid-cols-2">
        <div className="flex flex-col gap-7 p-8 sm:p-12">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-semibold"
          >
            <MediaMark className="size-6 text-primary" />
            openBGremover
          </Link>
          <p className="max-w-xs text-2xl tracking-tight">
            The next step for
            <br />
            your images.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border md:border-t-0 md:border-l">
          {[
            {
              title: "Product",
              links: [
                { label: "Playground", href: "/playground" },
                {
                  label: "Background removal",
                  href: "/playground?tool=remove",
                },
                { label: "Pricing", href: "/pricing" },
              ],
            },
            {
              title: "Build",
              links: [
                { label: "Documentation", href: "/docs" },
                { label: "API keys", href: "/dashboard" },
                {
                  label: "Source code",
                  href: "https://github.com/superuserkalo/openBGremover",
                },
              ],
            },
          ].map((group) => (
            <div key={group.title}>
              <p className="border-b border-border p-6 font-medium">
                {group.title}
              </p>
              {group.links.map((link) => (
                <Link
                  className="group flex items-center justify-between border-b border-border px-6 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                  <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-8 py-7 text-sm text-muted-foreground">
        <span>© 2026 openBGremover</span>
        <span>Open source. Built for your workflow.</span>
      </div>
    </footer>
  );
}
