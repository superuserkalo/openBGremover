"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const agents = [
  { name: "Claude Code", icon: "/agents/claude.svg" },
  { name: "Codex", icon: "/agents/openai.svg" },
  { name: "Cursor", icon: "/agents/cursor.svg" },
  { name: "Pi", icon: "/agents/pi.svg" },
  { name: "OpenCode", icon: "/agents/opencode.svg" },
];

export function AgentConnect() {
  const [copied, setCopied] = useState<string | null>(null);

  async function connect(name: string) {
    const prompt = `Read and follow ${window.location.origin}/agent-onboarding/SKILL.md`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(name);
      toast.success(`Setup prompt copied for ${name}`);
    } catch {
      toast.error("Could not copy the setup prompt.");
    }
  }

  return (
    <DropdownMenu.Root onOpenChange={() => setCopied(null)}>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="lg" className="gap-3">
          <span aria-hidden="true" className="flex -space-x-2">
            {agents.slice(0, 3).map((agent) => (
              <span
                key={agent.name}
                className="flex size-7 items-center justify-center rounded-full border-2 border-secondary bg-card"
              >
                <AgentIcon agent={agent} />
              </span>
            ))}
          </span>
          Connect agent
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          {agents.map((agent) => (
            <DropdownMenu.Item
              key={agent.name}
              onSelect={(event) => {
                event.preventDefault();
                void connect(agent.name);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none focus:bg-muted"
            >
              <AgentIcon agent={agent} />
              <span className="flex-1">{agent.name}</span>
              {copied === agent.name ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4 text-muted-foreground" />
              )}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={(event) => {
              event.preventDefault();
              void connect("Setup for Agents");
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none focus:bg-muted"
          >
            <FileText className="size-5" />
            <span className="flex-1">Setup for Agents</span>
            {copied === "Setup for Agents" ? (
              <Check className="size-4 text-primary" />
            ) : (
              <Copy className="size-4 text-muted-foreground" />
            )}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AgentIcon({ agent }: { agent: (typeof agents)[number] }) {
  return <img src={agent.icon} alt="" className="size-5 shrink-0 object-contain" />;
}
