import {
  CELL_SIZE,
  REDUCED_MOTION_TIME,
  sampleCell,
  trackPointer,
} from "./signal-field";
import type { Ink } from "./signal-field";

const frameDuration = 1000 / 30;

const inks: Record<Ink, string> = { gray: "#737373", orange: "#fa4b00" };

/** Pre-renders each glyph bitmap in each ink at device resolution. */
function createGlyphCache(ratio: number) {
  const cache = new Map<string, HTMLCanvasElement>();
  const dot = (CELL_SIZE / 6) * ratio;

  return (glyph: number, ink: Ink) => {
    const key = `${glyph}:${ink}`;
    const cached = cache.get(key);

    if (cached) return cached;
    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(dot * 5);
    sprite.height = Math.ceil(dot * 5);
    const context = sprite.getContext("2d");

    if (context) {
      context.fillStyle = inks[ink];

      for (let index = 0; index < 25; index++) {
        if ((glyph >> index) & 1)
          context.fillRect(
            Math.round((index % 5) * dot),
            Math.round(Math.floor(index / 5) * dot),
            Math.ceil(dot),
            Math.ceil(dot),
          );
      }
    }

    cache.set(key, sprite);

    return sprite;
  };
}

/** Canvas 2D renderer for browsers without WebGPU. */
export function startSignalCanvas(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d");

  if (!context) return () => {};

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = trackPointer(canvas, motion);
  let width = 0;
  let height = 0;
  let ratio = 1;
  let glyphs = createGlyphCache(ratio);
  let elapsed = 0;
  let previous = 0;
  let painted = 0;
  let frame = 0;
  let visible = false;
  let disposed = false;

  const draw = (deltaMs: number) => {
    const smoothed = pointer.step(deltaMs);

    const state = {
      width,
      height,
      time: motion.matches ? REDUCED_MOTION_TIME : elapsed / 1000,
      pointerX: smoothed.x,
      pointerY: smoothed.y,
      presence: smoothed.presence,
    };

    const columns = Math.ceil(width / CELL_SIZE);
    const rows = Math.ceil(height / CELL_SIZE);
    const inset = (CELL_SIZE * 5) / 6;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const paint = sampleCell(state, column, row);
        const x = column * CELL_SIZE;
        const y = row * CELL_SIZE;

        if (paint.kind === "checker") {
          context.globalAlpha = paint.strong ? 0.1 : 0.045;
          context.fillStyle = "#8c8c8c";
          context.fillRect(x, y, inset, inset);
        } else if (paint.kind === "glyph") {
          context.globalAlpha = paint.alpha;
          context.drawImage(glyphs(paint.glyph, paint.ink), x, y, inset, inset);
        }
      }
    }

    context.globalAlpha = 1;
    canvas.dataset.rendered = "true";
  };

  function tick(now: number) {
    const delta = now - previous;
    elapsed += delta;
    previous = now;

    if (now - painted >= frameDuration) {
      draw(now - painted);
      painted = now;
    }

    frame = requestAnimationFrame(tick);
  }

  function updatePlayback() {
    cancelAnimationFrame(frame);
    frame = 0;
    const showing = visible && !document.hidden && !disposed;
    canvas.dataset.motion = showing && !motion.matches ? "playing" : "paused";

    if (showing && !motion.matches) {
      previous = performance.now();
      painted = previous;
      frame = requestAnimationFrame(tick);
    } else if (showing) {
      draw(0);
    }
  }

  const resize = new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    glyphs = createGlyphCache(ratio);

    if (visible && !document.hidden) draw(0);
  });

  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    updatePlayback();
  });

  resize.observe(canvas);
  intersection.observe(canvas);
  motion.addEventListener("change", updatePlayback);
  document.addEventListener("visibilitychange", updatePlayback);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    pointer.dispose();
    motion.removeEventListener("change", updatePlayback);
    document.removeEventListener("visibilitychange", updatePlayback);
  };
}
