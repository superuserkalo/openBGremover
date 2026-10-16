const loopDuration = 12_000;

const frameDuration = 1000 / 30;

/** A deterministic field. Time wraps seamlessly because both waves use whole periods. */
function renderPixelField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
) {
  const phase = (elapsed % loopDuration) / loopDuration * Math.PI * 2;
  const spacing = 10;

  context.clearRect(0, 0, width, height);

  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const column = Math.floor(x / spacing);
      const row = Math.floor(y / spacing);
      const seed = ((column * 73 + row * 31) % 101) / 101;
      const wave = height * (0.52 + Math.sin(x / width * Math.PI * 2 + phase) * 0.18);
      const distance = (y - wave) / (height * 0.23);
      const band = Math.exp(-distance * distance * 2);
      const pulse = 0.65 + Math.sin(x / width * Math.PI * 4 - phase * 2 + row * 0.16) * 0.35;
      const strength = band * pulse;

      if (strength < 0.06 || seed > strength * 0.8 + 0.16) continue;

      context.globalAlpha = Math.min(0.72, strength * (0.28 + seed));
      context.fillStyle = strength > 0.48 ? "#fa4b00" : "#737373";

      if (seed > 0.58) {
        context.fillRect(x - 2.5, y - 0.5, 5, 1);
        context.fillRect(x - 0.5, y - 2.5, 1, 5);
      } else if (seed > 0.28) {
        context.fillRect(x - 2, y - 0.5, 4, 1);
      } else {
        context.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  }

  context.globalAlpha = 1;
}

export function startPixelField(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d");

  if (!context) return () => {};

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let elapsed = 0;
  let previous = 0;
  let painted = 0;
  let frame = 0;
  let visible = false;
  let disposed = false;

  const draw = () => {
    renderPixelField(context, width, height, elapsed);
    canvas.dataset.rendered = "true";
  };

  function tick(now: number) {
    frame = 0;
    elapsed += now - previous;
    previous = now;

    if (now - painted >= frameDuration) {
      draw();
      painted = now;
    }

    frame = requestAnimationFrame(tick);
  }

  function updatePlayback() {
    cancelAnimationFrame(frame);
    frame = 0;
    const playing = visible && !document.hidden && !motion.matches && !disposed;
    canvas.dataset.motion = playing ? "playing" : "paused";

    if (playing) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (visible && !document.hidden && !disposed) {
      draw();
    }
  }

  const resize = new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (visible && !document.hidden) draw();
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
    motion.removeEventListener("change", updatePlayback);
    document.removeEventListener("visibilitychange", updatePlayback);
  };
}
