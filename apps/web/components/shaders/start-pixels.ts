import { clock, effect, frameLoop, init, surface } from "vgpu";
import type { FrameLoopHandle, Gpu } from "vgpu";
import pixelShader from "./pixels.wgsl";

export function startPixels(canvas: HTMLCanvasElement): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  let inView = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0.5, y: 0.5 };

  const onPointer = (event: PointerEvent) => {
    if (reducedMotion.matches || !inView) return;

    const bounds = canvas.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) return;
    pointer.x = (event.clientX - bounds.left) / bounds.width;
    pointer.y = (event.clientY - bounds.top) / bounds.height;
  };

  window.addEventListener("pointermove", onPointer, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
  });

  observer.observe(canvas);

  async function start() {
    gpu = await init();

    if (disposed) {
      gpu.dispose();

      return;
    }

    const target = surface(gpu, canvas, { dpr: [1, 1.5] });

    const pixels = effect(gpu, pixelShader, {
      label: "media-pixels",
      set: {
        params: {
          time: 0,
          aspect: target.size[0] / target.size[1],
          pointer: [0.5, 0.5],
        },
      },
    });

    await pixels.compile(target);

    if (disposed) return;
    const time = clock(gpu);
    loop = frameLoop(
      gpu,
      (frame) => {
        if (!inView || document.hidden) return;
        pixels.set({
          params: {
            time: reducedMotion.matches ? 0 : time.time,
            aspect: target.size[0] / target.size[1],
            pointer: [pointer.x, pointer.y],
          },
        });
        frame.pass(target, pixels);
        canvas.dataset.rendered = "true";
      },
      { fps: reducedMotion.matches ? 1 : 30 },
    );
    void gpu.lost.then(() => {
      canvas.dataset.rendered = "false";
    });
  }

  void start().catch((cause) => {
    gpu?.dispose();
    canvas.dataset.rendered = "false";

    if (process.env.NODE_ENV === "development")
      console.warn("Pixel shader unavailable", cause);
  });

  return () => {
    disposed = true;
    loop?.stop();
    observer.disconnect();
    window.removeEventListener("pointermove", onPointer);
    gpu?.dispose();
  };
}
