"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Match } from "effect";
import {
  ArrowRight,
  Download,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { mediaOperations } from "@/lib/media-operations";
import { readImageResponse } from "@/lib/image-response";
import { apiFetch, trialFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { imageTransformBody, isHeic, readTransformResponse, sourceImageFormat, type TransformOptions } from "@/lib/image-transform";

const BACKGROUND_INPUTS = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] };

// Compression and conversion also read AVIF and HEIC; background removal does not.
const TRANSFORM_INPUTS = { ...BACKGROUND_INPUTS, "image/avif": [".avif"], "image/heic": [".heic"], "image/heif": [".heif"] };

type ProcessingState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "complete"; output: string; extension: "png" | "gif" | "jpeg" | "webp" | "avif"; summary: string }
  | { status: "failed"; message: string };

export function ImageComparison({
  original,
  result,
  label,
  resultLabel = "Removed",
}: {
  original: string;
  result: string;
  label: string;
  resultLabel?: string;
}) {
  const [position, setPosition] = useState(50);
  const id = useId().replace(/:/g, "");

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
      <svg
        viewBox="0 0 512 440"
        role="img"
        aria-label={label}
        className="block aspect-[512/440] w-full"
      >
        <defs>
          <pattern
            id={`${id}-grid`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <rect width="24" height="24" fill="#fafafa" />
            <path d="M0 0H12V12H0ZM12 12H24V24H12Z" fill="#eaeaea" />
          </pattern>
          <clipPath id={`${id}-clip`}>
            <rect width={(512 * position) / 100} height="440" />
          </clipPath>
        </defs>
        <rect width="512" height="440" fill={`url(#${id}-grid)`} />
        <image
          href={result}
          width="512"
          height="440"
          preserveAspectRatio="xMidYMid meet"
        />
        <image
          href={original}
          width="512"
          height="440"
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#${id}-clip)`}
        />
        <line
          x1={(512 * position) / 100}
          x2={(512 * position) / 100}
          y1="0"
          y2="440"
          stroke="white"
          strokeWidth="2"
        />
        <circle
          cx={(512 * position) / 100}
          cy="220"
          r="18"
          fill="white"
          stroke="#e5e5e5"
        />
        <path
          d={`M${(512 * position) / 100 - 4} 215l-5 5 5 5M${(512 * position) / 100 + 4} 215l5 5-5 5`}
          fill="none"
          stroke="#262626"
          strokeWidth="1.5"
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between text-xs">
        <span className="rounded bg-card/90 px-2 py-1">Original</span>
        <span className="rounded bg-card/90 px-2 py-1">{resultLabel}</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`Compare original and ${resultLabel.toLowerCase()} image`}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0 focus:opacity-100 focus:accent-primary"
      />
    </div>
  );
}

export function BackgroundRemovalDemo({
  initialTool = "remove",
}: {
  initialTool?: string;
}) {
  const selectedTool = mediaOperations.some(
    (operation) => operation.id === initialTool,
  )
    ? initialTool
    : "remove";

  const [tool, setTool] = useState(selectedTool);
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>({ status: "idle" });
  const [auth, setAuth] = useState<"loading" | "signed-in" | "signed-out">("loading");
  const [format, setFormat] = useState<TransformOptions["format"]>("webp");
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const [lossless, setLossless] = useState<boolean | undefined>(undefined);
  const [compressionLevel, setCompressionLevel] = useState<number | undefined>(undefined);
  const optionsId = useId();
  const request = useRef<AbortController | null>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const busy = state.status === "processing";
  const transform = tool === "compress" || tool === "convert";
  const outputFormat = tool === "compress" && file ? sourceImageFormat(file) : format;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session ? "signed-in" : "signed-out");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => () => request.current?.abort(), []);
  useLayoutEffect(() => {
    const list = tabList.current;

    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');

      if (active) setIndicator({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(list);

    return () => observer.disconnect();
  }, [tool]);
  useEffect(
    () => () => {
      if (original) URL.revokeObjectURL(original);
    },
    [original],
  );
  const output = state.status === "complete" ? state.output : null;
  useEffect(
    () => () => {
      if (output) URL.revokeObjectURL(output);
    },
    [output],
  );

  const onDrop = useCallback((files: File[]) => {
    const nextFile = files[0];

    if (!nextFile) return;

    if (tool === "compress" && isHeic(nextFile)) {
      setState({ status: "failed", message: "HEIC images can be converted, not compressed. Use Convert to make a JPEG, PNG, WebP, or AVIF." });

      return;
    }

    setFile(nextFile);
    setOriginal(URL.createObjectURL(nextFile));
    setState({ status: "idle" });
  }, [tool]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: transform ? TRANSFORM_INPUTS : BACKGROUND_INPUTS,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    disabled: busy,
    noClick: true,
    noKeyboard: true,
    onDropRejected: () =>
      setState({
        status: "failed",
        message: transform ? "Choose a PNG, JPEG, WebP, AVIF, or HEIC image up to 10 MiB." : "Choose a PNG, JPEG, or WebP image up to 10 MiB.",
      }),
  });

  async function processImage() {
    if (!file || busy || request.current) return;

    if (tool !== "remove" && !transform) return;

    const controller = new AbortController();
    request.current = controller;
    setState({ status: "processing" });

    try {
      if (transform) {
        const operation = tool === "compress" ? "compress-image" : "convert-image";
        const body = await imageTransformBody(file, { operation, format, quality, lossless, compressionLevel });

        const init = { method: "POST", headers: { "Content-Type": "application/json", Accept: "image/*" }, body, signal: controller.signal };

        // Signed-in requests use the account's credits; everyone else uses the free demo.
        const response = auth === "signed-in" ? await apiFetch(`/api/v1/${operation}`, init) : await trialFetch(operation, init);

        const { blob, extension, metadata } = await readTransformResponse(response, operation);

        if (controller.signal.aborted) return;

        const sizes = `${formatBytes(metadata.input_bytes)} → ${formatBytes(metadata.output_bytes)}`;

        const change = metadata.bytes_saved >= 0
          ? `${Math.round(metadata.bytes_saved / metadata.input_bytes * 100)}% smaller`
          : `${Math.round(-metadata.bytes_saved / metadata.input_bytes * 100)}% larger`;

        setState({
          status: "complete", output: URL.createObjectURL(blob), extension,
          summary: metadata.retained_original
            ? `${sizes} · Original kept: no smaller result at these settings.`
            : `${sizes} · ${change}`,
        });

        return;
      }

      // Preserve full source bytes. The shared API owns model preprocessing.
      const form = new FormData();
      form.append("file", file);
      form.append("format", "png");
      form.append("quality", "auto");

      const response = await trialFetch("remove-background", { method: "POST", body: form, signal: controller.signal });

      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error("The server did not return an image.");
      const blob = await readImageResponse(response);

      if (controller.signal.aborted) return;
      setState({ status: "complete", output: URL.createObjectURL(blob), extension: blob.type === "image/gif" ? "gif" : "png", summary: `${formatBytes(file.size)} → ${formatBytes(blob.size)}` });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setState({
        status: "failed",
        message:
          cause instanceof Error
            ? cause.message
            : "Could not process this image. Please try again.",
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function reset() {
    setFile(null);
    setOriginal(null);
    setState({ status: "idle" });
  }

  const operation =
    mediaOperations.find((item) => item.id === tool) ?? mediaOperations[0];

  const resultLabel = Match.value(tool).pipe(
    Match.when("compress", () => "Compressed"),
    Match.when("convert", () => "Converted"),
    Match.orElse(() => "Removed"),
  );

  return (
    <div className="w-full">
      <Tabs value={tool} onValueChange={(value) => { setTool(value); setState({ status: "idle" }); }} className="gap-0">
        <div
          {...getRootProps()}
          className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_16px_40px_-20px_rgba(0,0,0,0.2)] transition-shadow"
        >
          <input {...getInputProps()} aria-label="Upload image" />
          <div className="px-5 pt-6 pb-5 sm:px-6">
            {file && original ? (
              <div className="flex items-center gap-3">
                <img
                  src={original}
                  alt="Selected image"
                  className="size-14 rounded-lg border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={reset}
                  disabled={busy}
                  aria-label="Remove selected image"
                >
                  <X />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={open}
                className="flex min-h-16 w-full items-start gap-3 text-left text-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
              >
                <Paperclip className="mt-1 size-5 shrink-0 text-muted-foreground/60" />
                <span>
                  {isDragActive
                    ? "Drop your image here"
                    : "Drop an image. Make it ready for anything."}
                </span>
              </button>
            )}
          </div>
          {transform && (
            <fieldset disabled={busy} className="space-y-4 border-t border-border px-5 py-4 text-sm sm:px-6">
              <legend className="sr-only">{operation.name} settings</legend>
              {tool === "convert" ? (
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={`${optionsId}-format`}>Output format</label>
                  <select id={`${optionsId}-format`} value={format} onChange={(event) => {
                    const value = event.target.value;

                    if (value === "jpeg" || value === "png" || value === "webp" || value === "avif") setFormat(value);
                    setState({ status: "idle" });
                  }} className="rounded-lg border border-input bg-background px-3 py-2">
                    <option value="jpeg">JPEG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                    <option value="avif">AVIF</option>
                  </select>
                </div>
              ) : <p className="text-muted-foreground">Keep the original format. Return the original if it is already smaller.</p>}
              {tool === "convert" && outputFormat === "jpeg" && <p className="text-xs text-muted-foreground">Transparent areas become white in JPEG.</p>}
              <details className="group">
                <summary className="cursor-pointer font-medium">Advanced settings</summary>
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-muted-foreground">Leave settings blank to use recommended defaults. Overrides stay active when this section is closed.</p>
                  {(file || tool === "convert") ? (
                    <>
                      {outputFormat === "webp" && (
                        <div className="flex items-center justify-between gap-4">
                          <label htmlFor={`${optionsId}-lossless`}>WebP encoding</label>
                          <select id={`${optionsId}-lossless`} value={lossless === undefined ? "" : String(lossless)} onChange={(event) => {
                            setLossless(event.target.value === "" ? undefined : event.target.value === "true");
                            setState({ status: "idle" });
                          }} className="rounded-lg border border-input bg-background px-3 py-2">
                            <option value="">Recommended</option>
                            <option value="false">Lossy</option>
                            <option value="true">Lossless</option>
                          </select>
                        </div>
                      )}
                      {outputFormat === "png" ? (
                        <div className="space-y-2">
                          <label htmlFor={`${optionsId}-compression`} className="block">PNG compression level (0–9)</label>
                          <input id={`${optionsId}-compression`} type="number" min="0" max="9" step="1" value={compressionLevel ?? ""} placeholder="Recommended" onChange={(event) => { setCompressionLevel(event.target.value === "" ? undefined : Number(event.target.value)); setState({ status: "idle" }); }} className="w-full rounded-lg border border-input bg-background px-3 py-2" />
                          <p className="text-xs text-muted-foreground">Lossless. Higher levels take longer and may produce smaller files.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label htmlFor={`${optionsId}-quality`} className="block">{outputFormat === "webp" && lossless ? "Compression effort" : "Quality"} (1–100)</label>
                          <input id={`${optionsId}-quality`} type="number" min="1" max="100" step="1" value={quality ?? ""} placeholder="Recommended" onChange={(event) => { setQuality(event.target.value === "" ? undefined : Number(event.target.value)); setState({ status: "idle" }); }} className="w-full rounded-lg border border-input bg-background px-3 py-2" />
                          <p className="text-xs text-muted-foreground">{outputFormat === "webp" && lossless ? "Higher effort takes longer and may produce smaller files without changing pixel quality." : "Lower quality usually means a smaller file."}</p>
                        </div>
                      )}
                    </>
                  ) : <p className="text-xs text-muted-foreground">Choose an image to see settings for its format.</p>}
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    setQuality(undefined);
                    setLossless(undefined);
                    setCompressionLevel(undefined);
                    setState({ status: "idle" });
                  }}>Reset to recommended</Button>
                </div>
              </details>
              <p className="text-xs text-muted-foreground">
                Static JPEG, PNG, WebP, AVIF, or HEIC · Up to 10 MiB and 25 megapixels ·{" "}
                {auth === "signed-in"
                  ? "1 credit per successful operation, including an unchanged result."
                  : "Free to try without an account."}
              </p>
            </fieldset>
          )}
          <div className="flex items-center gap-2 border-t border-border p-3">
            <TooltipProvider delayDuration={180}>
              <TabsList ref={tabList} className="relative isolate h-11 min-w-0 flex-1 justify-start gap-0 overflow-x-auto rounded-xl bg-muted/70 p-0.5 [scrollbar-width:none]">
                {indicator && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-0 -z-10 rounded-[10px] bg-card shadow-sm transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.22,0.68,0,1)] motion-reduce:transition-none"
                    style={{ width: indicator.width, height: indicator.height, transform: `translate(${indicator.x}px, ${indicator.y}px)` }}
                  />
                )}
                {mediaOperations.map(item => (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <TabsTrigger value={item.id} data-state={tool === item.id ? "active" : "inactive"} disabled={busy} className="h-8 min-w-16 shrink-0 flex-none gap-1.5 rounded-md px-2 text-xs sm:flex-1 text-muted-foreground sm:text-sm data-[state=active]:text-foreground border-0 data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none transition-colors focus-visible:border-0 focus-visible:ring-0 focus-visible:outline-none [&[data-state=active]>svg]:text-primary">
                        <item.icon className="hidden size-4 sm:block" />
                        {item.short}
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">
                      {item.description}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TabsList>
            </TooltipProvider>
            {output ? (
              <Button asChild size="icon" className="size-11 rounded-xl sm:w-15">
                <a href={output} download={`${file?.name.replace(/\.[^.]+$/, "") || "image"}-${resultLabel.toLowerCase()}.${state.status === "complete" ? state.extension : "png"}`} aria-label="Download image"><Download className="size-5" /></a>
              </Button>
            ) : (
              <Button size="icon" onClick={() => file ? void processImage() : open()} disabled={busy || !operation.available || (Boolean(file) && transform && auth === "loading")} aria-label={busy ? "Processing image" : operation.available ? operation.name : `${operation.name} coming soon`} className="size-11 rounded-xl sm:w-15">
                {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : <ArrowRight className="size-5" />}
              </Button>
            )}
          </div>
        </div>
      </Tabs>
      {busy && <p role="status" className="mt-4 text-sm text-muted-foreground">Processing your image…</p>}
      {!operation.available && <p className="mt-4 text-sm text-muted-foreground">{operation.name} is coming soon. Try background removal, compression, or conversion.</p>}
      {state.status === "failed" && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {original && output && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>Your result</span>
            <span>Drag to compare</span>
          </div>
          <ImageComparison
            original={original}
            result={output}
            label={`Image before and after ${operation.name.toLowerCase()}`}
            resultLabel={resultLabel}
          />
          <p role="status" className="mt-3 px-1 text-sm text-muted-foreground">{state.status === "complete" ? state.summary : ""}</p>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
}
