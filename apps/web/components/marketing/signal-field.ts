/**
 * Hero "signal field": a dithered ASCII ribbon that a scan line keeps cutting
 * out to a transparency checkerboard, plus a pointer reticle that does the same.
 *
 * This module is the Canvas 2D fallback and the reference for the WebGPU shader
 * in `components/shaders/signal-field.wgsl`. Keep the constants and math in both
 * files in step.
 */

/** Cell size in CSS pixels. Glyphs are 5×5 dots of `CELL_SIZE / 6`. */
export const CELL_SIZE = 12;

/** A fixed frame for reduced motion: the scan sits mid-hero, mid-cut. */
export const REDUCED_MOTION_TIME = 4.5;

/** 5×5 bitmaps, bit = row * 5 + column: blank . : - + x ✦ # */
export const GLYPHS = [
  0, 4096, 131200, 14336, 145536, 332096, 4685252, 11512810,
] as const;

export const BAR_GLYPH = 4329604;

export const PLUS_GLYPH = 145536;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const SWEEP_PERIOD = 9;

const RETICLE_RADIUS = 0.1;

export type Ink = "gray" | "orange";

export type CellPaint =
  | { readonly kind: "none" }
  | { readonly kind: "checker"; readonly strong: boolean }
  | {
      readonly kind: "glyph";
      readonly glyph: number;
      readonly ink: Ink;
      readonly alpha: number;
    };

export interface FieldState {
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly time: number;
  /** Smoothed pointer in CSS pixels, relative to the canvas. */
  readonly pointerX: number;
  readonly pointerY: number;
  /** 0 when the pointer is away, 1 when it is over the canvas. */
  readonly presence: number;
}

const NONE: CellPaint = { kind: "none" };

function fract(value: number) {
  return value - Math.floor(value);
}

function hash(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;

  const bottom =
    hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;

  return top + (bottom - top) * uy;
}

function fbm(x: number, y: number) {
  let value = 0;
  let amplitude = 0.5;
  let qx = x;
  let qy = y;

  for (let octave = 0; octave < 3; octave++) {
    value += amplitude * noise(qx, qy);
    qx = qx * 2.03 + 1.7;
    qy = qy * 2.03 + 9.2;
    amplitude *= 0.5;
  }

  return value / 0.875;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
}

/** Ribbon centre line and falloff, in height-normalised units. */
export function ribbonBand(px: number, py: number, time: number) {
  const center =
    0.86 +
    0.045 * Math.sin(px * 1.7 + time * 0.4) +
    0.02 * Math.sin(px * 4.3 - time * 0.7);

  const distance = (py - center) / 0.12;

  return Math.exp(-distance * distance);
}

/** What one grid cell shows this frame. */
export function sampleCell(
  state: FieldState,
  column: number,
  row: number,
): CellPaint {
  const { height, time } = state;
  const centerX = (column + 0.5) * CELL_SIZE;
  const centerY = (row + 0.5) * CELL_SIZE;
  const px = centerX / height;
  const py = centerY / height;
  const cellHash = hash(column + 0.37, row + 0.37);

  // Pointer reticle: rotating tick ring, cut-out interior, centre mark.
  if (state.presence > 0 && cellHash < state.presence) {
    const dx = (centerX - state.pointerX) / height;
    const dy = (centerY - state.pointerY) / height;
    const radius = Math.hypot(dx, dy);
    const ringWidth = (CELL_SIZE / height) * 0.75;

    if (radius < (CELL_SIZE / height) * 0.6)
      return { kind: "glyph", glyph: PLUS_GLYPH, ink: "orange", alpha: 1 };

    if (Math.abs(radius - RETICLE_RADIUS) < ringWidth) {
      const angle = Math.atan2(dy, dx) + time * 0.8;

      if (fract((angle / (Math.PI * 2)) * 16) < 0.5)
        return { kind: "glyph", glyph: GLYPHS[7], ink: "orange", alpha: 0.95 };
    }

    if (radius < RETICLE_RADIUS - ringWidth)
      return { kind: "checker", strong: (column + row) % 2 === 0 };
  }

  const band = ribbonBand(px, py, time);

  if (band < 0.01) return NONE;

  // Scan line: cells just behind it are cut out, then dither back in.
  const sweep = fract(time / SWEEP_PERIOD) * 1.6 - 0.3;
  const behind = sweep - centerX / state.width;
  const sweepColumn = Math.floor((sweep * state.width) / CELL_SIZE);

  if (band > 0.2 && column === sweepColumn)
    return { kind: "glyph", glyph: BAR_GLYPH, ink: "orange", alpha: 1 };

  if (band > 0.25 && column < sweepColumn && behind / 0.38 < cellHash)
    return { kind: "checker", strong: (column + row) % 2 === 0 };

  const warpX = noise(px * 1.4 + time * 0.07, py * 1.4);
  const warpY = noise(px * 1.4 + 4.3, py * 1.4 - time * 0.05);

  const n = fbm(
    px * 2.6 + warpX * 1.6 - time * 0.11,
    py * 2.6 + warpY * 1.6,
  );

  const value = Math.min(1, smoothstep(0.32, 0.8, n) * band * 1.4);
  const bayer = ((BAYER[(row % 4) * 4 + (column % 4)] ?? 0) + 0.5) / 16;
  const level = Math.min(7, Math.floor(value * 7 + bayer));

  if (level === 0) return NONE;

  return {
    kind: "glyph",
    glyph: GLYPHS[level] ?? 0,
    ink: level >= 5 ? "orange" : "gray",
    alpha: level >= 5 ? 0.9 : 0.15 + level * 0.12,
  };
}

export interface PointerTracker {
  /** Eases toward the live pointer and returns the smoothed state. */
  step(deltaMs: number): { x: number; y: number; presence: number };
  dispose(): void;
}

/** Tracks the pointer relative to `element`, ignoring it under reduced motion. */
export function trackPointer(
  element: HTMLElement,
  reducedMotion: MediaQueryList,
): PointerTracker {
  const target = { x: 0, y: 0, inside: false };
  const current = { x: 0, y: 0, presence: 0 };
  let placed = false;

  const onMove = (event: PointerEvent) => {
    const bounds = element.getBoundingClientRect();
    target.x = event.clientX - bounds.left;
    target.y = event.clientY - bounds.top;
    target.inside =
      event.pointerType === "mouse" &&
      target.x >= 0 &&
      target.y >= 0 &&
      target.x <= bounds.width &&
      target.y <= bounds.height;
  };

  const onLeave = () => {
    target.inside = false;
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);

  return {
    step(deltaMs) {
      const active = target.inside && !reducedMotion.matches;

      if (active && !placed) {
        current.x = target.x;
        current.y = target.y;
        placed = true;
      }

      const follow = 1 - Math.exp(-deltaMs / 70);
      const fade = 1 - Math.exp(-deltaMs / 160);
      current.x += (target.x - current.x) * follow;
      current.y += (target.y - current.y) * follow;
      current.presence += ((active ? 1 : 0) - current.presence) * fade;

      if (current.presence < 0.01) {
        current.presence = 0;
        placed = false;
      }

      return current;
    },
    dispose() {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    },
  };
}
