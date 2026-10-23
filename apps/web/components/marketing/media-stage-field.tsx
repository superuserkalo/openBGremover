"use client";

import { useEffect, useRef } from "react";
import { startMediaStage } from "./media-stage";

/**
 * Full-bleed ASCII media stage for a section. Mark the section's text with
 * `data-stage-calm` to quiet the effect behind it, and opaque cards with
 * `data-stage-hide` to skip drawing under them.
 */
export function MediaStage() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;
    const section = element.closest("section") ?? document.body;

    return startMediaStage(element, {
      calm: () => [...section.querySelectorAll("[data-stage-calm]")],
      hide: () => [...section.querySelectorAll("[data-stage-hide]")],
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas
        ref={canvas}
        data-rendered="false"
        className="absolute inset-0 size-full opacity-0 transition-opacity duration-700 data-[rendered=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
