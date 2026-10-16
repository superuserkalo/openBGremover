"use client";

import { Match } from "effect";
import { useEffect, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const examples = {
  curl: String.raw`curl -X POST "$OPENBG_API_URL/api/v1/remove-background" \
  -H "Authorization: Bearer $OPENBG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_data": "BASE64_IMAGE",
    "format": "png"
  }'`,
  node: `import { OpenBG } from "@openbg/sdk"

const app = new OpenBG({ apiKey: "bg-YOUR_API_KEY" })

const result = await app.removeBackground("image.png")
await result.save("output.png")`,
  python: `from openbg import OpenBG

app = OpenBG(api_key="bg-YOUR_API_KEY")

result = app.remove_background("image.png")
result.save("output.png")`,
};

export function CodeExample() {
  const [language, setLanguage] = useState("python");
  const [copied, setCopied] = useState(false);

  const code = Match.value(language).pipe(
    Match.when("python", () => examples.python),
    Match.when("node", () => examples.node),
    Match.orElse(() => examples.curl),
  );

  const displayed = useDiffusion(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the code to copy it manually.");
    }
  }

  return (
    <div className="overflow-hidden border-y border-border bg-card/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-8">
        <Tabs
          value={language}
          onValueChange={(value) => {
            setLanguage(value);
            setCopied(false);
          }}
        >
          <TabsList className="h-13 gap-2 bg-transparent p-0">
            <TabsTrigger
              value="python"
              className="h-11 rounded-full px-3 text-sm sm:px-6"
            >
              Python
            </TabsTrigger>
            <TabsTrigger
              value="node"
              className="h-11 rounded-full px-3 text-sm sm:px-6"
            >
              Node.js
            </TabsTrigger>
            <TabsTrigger
              value="curl"
              className="h-11 rounded-full px-3 text-sm sm:px-6"
            >
              <Terminal />
              cURL
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 overflow-x-auto p-6 sm:p-9">
          <pre className="min-h-72 text-xs leading-7 sm:text-sm">
            <code aria-label={code}>
              {displayed.split("\n").map((line, index) => (
                <span key={index} aria-hidden="true" className="block">
                  <span
                    aria-hidden="true"
                    className="mr-6 inline-block w-4 select-none text-right text-muted-foreground/40"
                  >
                    {index + 1}
                  </span>
                  <CodeLine line={line} />
                </span>
              ))}
            </code>
          </pre>
        </div>
        <div className="border-t border-border lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between border-b border-border px-7 py-4 text-xs text-muted-foreground">
            <span>Example response</span>
            <span>JSON</span>
          </div>
          <pre className="overflow-x-auto p-7 text-xs leading-7 sm:text-sm">
            <code>{`{
  "success": true,
  "result_image": "BASE64_PNG",
  "processing_time_ms": 1234,
  "metadata": {
    "format": "png"
  }
}`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function useDiffusion(code: string): string {
  const [displayed, setDisplayed] = useState(code);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (motion.matches) {
      const settled = requestAnimationFrame(() => setDisplayed(code));

      return () => cancelAnimationFrame(settled);
    }

    let frame = 0;
    const started = performance.now();
    const glyphs = "abcdefghijklmnopqrstuvwxyz0123456789+-*/";

    function render(now: number) {
      const progress = Math.min(1, (now - started) / 540);
      setDisplayed(
        Array.from(code, (character, index) => {
          if (!/[a-zA-Z0-9]/.test(character) || progress >= 1) return character;
          const threshold = ((index * 37) % 101) / 101;

          if (progress > threshold) return character;

          return glyphs.charAt(
            (index * 13 + Math.floor(now / 42)) % glyphs.length,
          );
        }).join(""),
      );

      if (progress < 1) frame = requestAnimationFrame(render);
    }

    frame = requestAnimationFrame(render);

    function stop() {
      if (motion.matches) {
        cancelAnimationFrame(frame);
        setDisplayed(code);
      }
    }

    motion.addEventListener("change", stop);

    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", stop);
    };
  }, [code]);

  return displayed;
}

function CodeLine({ line }: { line: string }) {
  const tokens = (line || " ").split(
    /("[^"\n]*"|'[^'\n]*'|#[^\n]*|\b(?:OpenBG|removeBackground|remove_background|save)\b)/g,
  );

  return (
    <>
      {tokens.map((token, index) => {
        let color = "text-foreground";

        if (token.startsWith('"') || token.startsWith("'"))
          color = "text-primary";
        else if (token.startsWith("#")) color = "text-muted-foreground";
        else if (
          /^(OpenBG|removeBackground|remove_background|save)$/.test(token)
        )
          color = "text-violet-500";

        return (
          <span key={index} className={color}>
            {token}
          </span>
        );
      })}
    </>
  );
}
