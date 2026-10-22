import { clock, effect, frameLoop, init, surface } from "vgpu";
import type { FrameLoopHandle, Gpu } from "vgpu";
import {
  CELL_SIZE,
  REDUCED_MOTION_TIME,
  trackPointer,
} from "@/components/marketing/signal-field";
import signalShader from "./signal-field.wgsl";

/**
 * Renders the signal field with WebGPU. Calls `onUnavailable` once if WebGPU
 * is missing, fails to start, or loses its device, so the caller can swap in
 * the Canvas 2D renderer on a fresh canvas.
 */
export function startSignalGpu(
  canvas: HTMLCanvasElement,
  onUnavailable: () => void,
): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  let inView = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = trackPointer(canvas, reducedMotion);

  const observer = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
  });

  observer.observe(canvas);

  const fail = (cause: unknown) => {
    if (disposed) return;
    canvas.dataset.rendered = "false";

    if (process.env.NODE_ENV === "development")
      console.warn("WebGPU signal field unavailable", cause);
    onUnavailable();
  };

  async function start() {
    if (!("gpu" in navigator)) throw new Error("navigator.gpu is missing");
    gpu = await init();

    if (disposed) {
      gpu.dispose();

      return;
    }

    const target = surface(gpu, canvas, {
      dpr: [1, 1.5],
      clearColor: [0, 0, 0, 0],
    });

    const scale = () => target.size[1] / Math.max(1, canvas.clientHeight);

    const field = effect(gpu, signalShader, {
      label: "signal-field",
      set: {
        params: {
          resolution: [target.size[0], target.size[1]],
          pointer: [0, 0],
          time: REDUCED_MOTION_TIME,
          cell: CELL_SIZE * scale(),
          presence: 0,
        },
      },
    });

    await field.compile(target);

    if (disposed) return;
    const time = clock(gpu);
    let previous = performance.now();

    loop = frameLoop(
      gpu,
      (frame) => {
        const now = performance.now();
        const smoothed = pointer.step(now - previous);
        previous = now;

        if (!inView || document.hidden) return;
        const ratio = scale();
        field.set({
          params: {
            resolution: [target.size[0], target.size[1]],
            pointer: [smoothed.x * ratio, smoothed.y * ratio],
            time: reducedMotion.matches ? REDUCED_MOTION_TIME : time.time,
            cell: CELL_SIZE * ratio,
            presence: smoothed.presence,
          },
        });
        frame.pass(target, field);
        canvas.dataset.rendered = "true";
      },
      { fps: reducedMotion.matches ? 1 : 60 },
    );
    void gpu.lost.then(fail);
  }

  void start().catch((cause: unknown) => {
    gpu?.dispose();
    fail(cause);
  });

  return () => {
    disposed = true;
    loop?.stop();
    observer.disconnect();
    pointer.dispose();
    gpu?.dispose();
  };
}
