"use client";

import { useEffect, useRef, useState } from "react";
import { startSignalGpu } from "@/components/shaders/start-signal-gpu";
import { startSignalCanvas } from "./start-signal-canvas";

type Renderer = "webgpu" | "canvas";

export function PixelField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<Renderer>("webgpu");

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;

    if (renderer === "canvas") return startSignalCanvas(element);

    return startSignalGpu(element, () => setRenderer("canvas"));
  }, [renderer]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 grid grid-cols-10 grid-rows-5 opacity-70">
        {Array.from({ length: 50 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-center rounded-lg border border-border/60"
          >
            <span className="size-1 rounded-full bg-border" />
          </div>
        ))}
      </div>
      {/* A WebGPU canvas cannot later return a 2D context, so the fallback remounts it. */}
      <canvas
        key={renderer}
        ref={canvas}
        data-renderer={renderer}
        data-rendered="false"
        className="absolute inset-0 size-full opacity-0 mask-[linear-gradient(to_top,black_45%,transparent_95%)] transition-opacity duration-700 data-[rendered=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
