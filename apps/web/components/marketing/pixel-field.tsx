"use client";

import { useEffect, useRef } from "react";
import { startPixelField } from "./start-pixel-field";

export function PixelField() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;

    return startPixelField(element);
  }, []);

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
      <canvas
        ref={canvas}
        data-rendered="false"
        className="absolute inset-x-0 bottom-0 h-72 w-full opacity-0 transition-opacity duration-700 data-[rendered=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
