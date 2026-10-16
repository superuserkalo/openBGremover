import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { MediaMark } from "@/components/brand/media-mark";
import { docsSource } from "@/lib/docs-source";
import "./docs.css";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={docsSource.getPageTree()}
        nav={{
          title: <span className="flex items-center gap-2 text-sm font-semibold"><MediaMark className="size-5 text-primary" />openBGremover <span className="font-normal text-muted-foreground">/ Docs</span></span>,
          url: "/docs",
        }}
        links={[
          { text: "Product", url: "/", active: "none" },
          { text: "Playground", url: "/playground", active: "none" },
          { text: "API keys", url: "/dashboard", active: "none" },
        ]}
        githubUrl="https://github.com/superuserkalo/openBGremover"
        themeSwitch={{ enabled: false }}
        tabs={false}
        sidebar={{ defaultOpenLevel: 1, prefetch: false }}
        containerProps={{ className: "openbg-docs" }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
