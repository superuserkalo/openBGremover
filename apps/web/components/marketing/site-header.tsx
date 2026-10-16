"use client";

import { MediaMark } from "@/components/brand/media-mark";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Code2, Menu, X } from "lucide-react";
import { Github } from "@/components/brand/github-icon";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { mediaOperations } from "@/lib/media-operations";

export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="openBGremover home"
      className="inline-flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight"
    >
      <MediaMark className="size-6 text-primary" />
      openBGremover
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="relative mx-auto flex h-22 max-w-7xl items-center justify-between gap-4 border-x border-border px-5 lg:h-24 lg:px-10">
        <Wordmark />
        <NavigationMenu
          className="static hidden lg:flex [&>div]:static!"
          viewport={false}
        >
          <NavigationMenuList>
            <NavigationMenuItem className="static">
              <NavigationMenuTrigger>Products</NavigationMenuTrigger>
              <NavigationMenuContent className="left-0 border-border bg-background p-0 md:left-0 md:w-full">
                <div className="grid grid-cols-[1.1fr_1fr_1fr] divide-x divide-border">
                  <div>
                    <p className="px-6 py-5 text-sm text-muted-foreground">
                      Media operations
                    </p>
                    {mediaOperations.map((item) => (
                      <NavigationMenuLink
                        key={item.id}
                        asChild
                        className="rounded-none border-t border-border p-5"
                      >
                        <Link href={`/playground?tool=${item.id}`}>
                          <span className="flex items-center gap-3">
                            <item.icon className="size-4 text-primary" />
                            <span>{item.name}</span>
                          </span>
                          <span className="mt-1 pl-7 text-muted-foreground">
                            {item.description}
                          </span>
                        </Link>
                      </NavigationMenuLink>
                    ))}
                  </div>
                  <div>
                    <p className="px-6 py-5 text-sm text-muted-foreground">
                      Ways to use it
                    </p>
                    <NavigationMenuLink
                      asChild
                      className="rounded-none border-t border-border p-6"
                    >
                      <Link href="/playground">
                        <span className="font-medium">Playground</span>
                        <span className="text-muted-foreground">
                          Your first image, without code.
                        </span>
                      </Link>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      asChild
                      className="rounded-none border-t border-border p-6"
                    >
                      <Link href="/docs">
                        <span className="flex items-center gap-2">
                          <Code2 />
                          HTTP API
                        </span>
                        <span className="text-muted-foreground">
                          One endpoint for your app or agent.
                        </span>
                      </Link>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      asChild
                      className="rounded-none border-t border-border p-6"
                    >
                      <Link href="/dashboard">
                        <span>API keys</span>
                        <span className="text-muted-foreground">
                          Connect your own workflow.
                        </span>
                      </Link>
                    </NavigationMenuLink>
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-primary p-6 text-primary-foreground">
                      <MediaMark className="mb-7 size-7" />
                      <p className="text-xl font-medium">
                        A little less background.
                        <br />A lot more possibility.
                      </p>
                      <NavigationMenuLink
                        asChild
                        className="mt-5 p-0 text-primary-foreground hover:bg-transparent hover:text-primary-foreground"
                      >
                        <Link href="/playground">
                          Try an image <ArrowUpRight />
                        </Link>
                      </NavigationMenuLink>
                    </div>
                    <div className="p-6">
                      <Github className="mb-4 size-6" />
                      <p className="text-sm text-muted-foreground">
                        Built in the open.
                      </p>
                      <NavigationMenuLink asChild className="mt-2 p-0">
                        <a
                          href="https://github.com/superuserkalo/openBGremover"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Explore the source <ArrowUpRight />
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem className="static">
              <NavigationMenuLink asChild>
                <Link href="/pricing">Pricing</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem className="static">
              <NavigationMenuLink asChild>
                <Link href="/docs">Docs</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem className="static">
              <NavigationMenuLink asChild>
                <Link href="/playground">Playground</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div className="hidden items-center gap-3 lg:flex">
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/superuserkalo/openBGremover"
              aria-label="GitHub repository"
            >
              <Github />
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
        <Button
          className="lg:hidden"
          variant="ghost"
          size="icon"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t border-border bg-background p-5 lg:hidden"
        >
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
            {mediaOperations.map((item) => (
              <Link
                onClick={() => setOpen(false)}
                key={item.id}
                className="rounded-lg p-3 text-sm hover:bg-muted"
                href={`/playground?tool=${item.id}`}
              >
                {item.name}
                {!item.available && (
                  <span className="ml-2 text-muted-foreground">Soon</span>
                )}
              </Link>
            ))}
            {[
              { href: "/docs", label: "Docs" },
              { href: "/pricing", label: "Pricing" },
              { href: "/playground", label: "Playground" },
              { href: "/signup", label: "Sign up" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg p-3 hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
