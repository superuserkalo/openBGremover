import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/docs/index.md", destination: "/llms.mdx/docs" },
      { source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*" },
    ];
  },
  transpilePackages: ["@openbg/contracts"],
};

export default createMDX()(nextConfig);
