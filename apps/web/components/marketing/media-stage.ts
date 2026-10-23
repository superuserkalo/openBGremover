/**
 * Media stage: the hero is one ASCII canvas. An orange scan crosses it and
 * each pass runs a different media operation on what is shown.
 *
 * Canvas 2D with a glyph atlas: about 15k characters per frame at 30fps stay
 * well inside a frame budget, and every browser can run it.
 */
import {
  PORTRAIT_ALPHA,
  PORTRAIT_LUMA,
  PORTRAIT_SIZE,
} from "./media-stage-portrait";

/** Character cell size in CSS pixels. */
export const CELL_WIDTH = 6;

export const CELL_HEIGHT = 9;

export const SCENE_SECONDS = 5.4;

const FRAME_MS = 1000 / 30;

const RAMP = " .:-=+*#%@";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** 0 ink, 1 gray, 2 orange. */
type Ink = 0 | 1 | 2;

export type SceneId =
  | "remove"
  | "transcribe"
  | "merge"
  | "compress"
  | "parse"
  | "video"
  | "upscale"
  | "denoise";

export interface Scene {
  readonly id: SceneId;
  readonly name: string;
  readonly media: string;
  readonly result: string;
}

/** Ordered so neighbouring passes show different media. */
export const SCENES: readonly [Scene, ...Scene[]] = [
  {
    id: "remove",
    name: "REMOVE BG",
    media: "IMAGE",
    result: ".JPG → .PNG + ALPHA",
  },
  {
    id: "transcribe",
    name: "TRANSCRIBE",
    media: "AUDIO",
    result: ".WAV → TEXT",
  },
  { id: "merge", name: "MERGE", media: "PDF", result: "4 FILES → 1 PDF" },
  {
    id: "compress",
    name: "COMPRESS",
    media: "IMAGE",
    result: "4.2 MB → 0.9 MB",
  },
  {
    id: "parse",
    name: "PARSE",
    media: "DOCUMENT",
    result: ".PDF → MARKDOWN",
  },
  { id: "video", name: "CONVERT", media: "VIDEO", result: ".MOV → .MP4" },
  { id: "upscale", name: "UPSCALE", media: "IMAGE", result: "512 → 2048 PX" },
  { id: "denoise", name: "CLEAN UP", media: "AUDIO", result: "−24 DB NOISE" },
];

const TRANSCRIPT =
  "so the launch moves to friday at noon. can you send the slides before the call, and loop in design for the new hero.";

const DOCUMENT = [
  "# Invoice 042",
  "",
  "Billed to: Acme Studio",
  "Issued:    24 Oct 2026",
  "",
  "| Item          | Qty | Price  |",
  "| ------------- | --- | ------ |",
  "| Logo design   |   1 |  40.00 |",
  "| Font license  |   1 |   2.00 |",
  "",
  "**Total: 42.00 EUR**",
  "",
  "## Notes",
  "",
  "- Paid by card",
  "- Thank you!",
] as const;

const MERGE_FILES = ["brief.pdf", "terms.pdf", "invoice.pdf", "photos.pdf"];

/** A static frame for reduced motion: the background has just been removed. */
export const REDUCED_MOTION_ELAPSED = 4.2;

function decodeHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index++)
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);

  return bytes;
}

const LUMA = decodeHex(PORTRAIT_LUMA);

const ALPHA = decodeHex(PORTRAIT_ALPHA);

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;

  return s - Math.floor(s);
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

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

/** Bilinear sample of a portrait grid at u, v in 0..1; returns 0..1. */
function samplePortrait(grid: Uint8Array, u: number, v: number) {
  const n = PORTRAIT_SIZE;
  const x = Math.min(n - 1.001, Math.max(0, u * n - 0.5));
  const y = Math.min(n - 1.001, Math.max(0, v * n - 0.5));
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const at = (cx: number, cy: number) => grid[cy * n + cx] ?? 0;
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;

  const bottom =
    at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;

  return (top + (bottom - top) * fy) / 255;
}

/** Darkness (0..1) and whether the point belongs to the cut-out subject. */
export function portraitAt(u: number, v: number) {
  return {
    dark: clamp((1 - samplePortrait(LUMA, u, v) - 0.1) * 1.3),
    subject: samplePortrait(ALPHA, u, v) > 0.5,
  };
}

export interface ScenePhase {
  readonly index: number;
  readonly scene: Scene;
  /** Seconds into this scene. */
  readonly time: number;
  /** Characters dither in over the first 0.6s. */
  readonly appear: number;
  /** And out over the last 0.6s. */
  readonly vanish: number;
  /** Scan progress across the hero, 0..1. */
  readonly sweep: number;
}

/** Which scene runs at `elapsed` seconds and how far along it is. */
export function scenePhase(elapsed: number): ScenePhase {
  const index = Math.floor(elapsed / SCENE_SECONDS) % SCENES.length;
  const time = elapsed % SCENE_SECONDS;

  return {
    index,
    scene: SCENES[index] ?? SCENES[0],
    time,
    appear: clamp(time / 0.6),
    vanish: clamp((time - (SCENE_SECONDS - 0.6)) / 0.6),
    sweep: clamp((time - 0.8) / 2.8),
  };
}

export interface StageTargets {
  /** Elements the effect should quiet down behind, such as the headline. */
  calm(): Element[];
  /** Opaque elements the effect never draws under. */
  hide(): Element[];
}

/** Starts the stage on `canvas`; returns a cleanup function. */
export function startMediaStage(
  canvas: HTMLCanvasElement,
  targets: StageTargets,
): () => void {
  const context = canvas.getContext("2d");

  if (!context) return () => {};

  const ctx = context;
  const rootStyle = getComputedStyle(document.documentElement);

  const colors = [
    rootStyle.getPropertyValue("--foreground").trim() || "#262626",
    rootStyle.getPropertyValue("--muted-foreground").trim() || "#737373",
    rootStyle.getPropertyValue("--primary").trim() || "#fa4b00",
  ] as const;

  const mono =
    getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim() ||
    "ui-monospace, monospace";

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const CW = CELL_WIDTH;
  const CH = CELL_HEIGHT;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let cols = 0;
  let rows = 0;
  // Per character: 0 hidden behind UI, otherwise an opacity multiplier.
  let calm = new Float32Array(0);
  let atlas: HTMLCanvasElement | undefined;
  let frame = 0;
  let elapsed = 0;
  let previous = 0;
  let painted = 0;
  let visible = false;

  // Printable ASCII in three inks, rendered once per resize.
  const buildAtlas = () => {
    const sheet = document.createElement("canvas");
    sheet.width = Math.ceil(95 * CW * ratio);
    sheet.height = Math.ceil(3 * CH * ratio);
    const g = sheet.getContext("2d");

    if (!g) return undefined;
    g.scale(ratio, ratio);
    g.font = `${CH}px ${mono}`;
    g.textBaseline = "top";

    colors.forEach((color, ink) => {
      g.fillStyle = color;

      for (let code = 0; code < 95; code++)
        g.fillText(String.fromCharCode(32 + code), code * CW, ink * CH);
    });

    return sheet;
  };

  const measure = () => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    cols = Math.ceil(width / CW);
    rows = Math.ceil(height / CH);
    calm = new Float32Array(cols * rows).fill(1);

    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();

      return {
        x: r.left - bounds.left,
        y: r.top - bounds.top,
        w: r.width,
        h: r.height,
      };
    };

    const quiet = targets.calm().map(rect);
    const hidden = targets.hide().map(rect);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CW;
        const y = (r + 0.5) * CH;
        let value = 1;

        for (const box of quiet) {
          // Fade to 12% inside the box, feathered over 40px around it.
          const dx = Math.max(box.x - x, 0, x - (box.x + box.w));
          const dy = Math.max(box.y - y, 0, y - (box.y + box.h));
          const inside = 1 - clamp(Math.hypot(dx, dy) / 40);
          value = Math.min(value, 1 - inside * 0.88);
        }

        for (const box of hidden) {
          if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h)
            value = 0;
        }

        calm[r * cols + c] = value;
      }
    }

    atlas = buildAtlas();
  };

  const put = (c: number, r: number, ch: string, ink: Ink, alpha: number) => {
    if (!atlas || c < 0 || r < 0 || c >= cols || r >= rows) return;
    const k = calm[r * cols + c] ?? 0;

    if (k === 0 || ch === " ") return;
    const code = ch.charCodeAt(0) - 32;

    if (code < 0 || code > 94) return;
    ctx.globalAlpha = alpha * k;

    ctx.drawImage(
      atlas,
      code * CW * ratio,
      ink * CH * ratio,
      CW * ratio,
      CH * ratio,
      c * CW,
      r * CH,
      CW,
      CH,
    );
  };

  const glyph = (density: number, c: number, r: number) => {
    const bayer = ((BAYER[(r % 4) * 4 + (c % 4)] ?? 0) + 0.5) / 16 - 0.5;

    const level = Math.max(
      0,
      Math.min(
        RAMP.length - 1,
        Math.floor((density + bayer * 0.15) * RAMP.length),
      ),
    );

    return RAMP[level] ?? " ";
  };

  // The portrait covers the hero with the face upper right, clear of the headline.
  const photoAt = (c: number, r: number) => {
    const size = Math.max(width * 1.05, height * (width > 700 ? 1.6 : 0.9));
    const left = width * 0.7 - size * 0.45;
    const top = height * 0.3 - size * 0.25;
    const u = ((c + 0.5) * CW - left) / size;
    const v = ((r + 0.5) * CH - top) / size;

    if (u < 0 || u > 1 || v < 0 || v > 1)
      return { dark: 0.12 * noise(c * 0.2, r * 0.2), subject: false };

    return portraitAt(u, v);
  };

  type Show = (c: number, r: number) => boolean;

  type PhotoMode = "fine" | "coarse" | "cut";

  const drawPhoto = (
    sweepCol: number,
    show: Show,
    mode: (done: boolean) => PhotoMode,
  ) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!show(c, r)) continue;
        const m = mode(c < sweepCol);
        const { dark, subject } = photoAt(c, r);

        if (m === "cut" && !subject) {
          // Removed background: a sparse orange checkerboard.
          if (c % 2 === 0 && (r + (c >> 1)) % 2 === 0) put(c, r, "+", 2, 0.4);
          continue;
        }

        // Compressed: the same outline with its shading flattened to a few tones.
        const tones = subject ? " :+#" : "  .:";

        const ch =
          m === "coarse"
            ? (tones[Math.min(3, Math.floor(dark * 3.2 + 0.25))] ?? " ")
            : glyph(subject ? dark : dark * 0.75, c, r);

        put(c, r, ch, subject ? 0 : 1, subject ? 0.85 : 0.28);
      }
    }
  };

  const drawWave = (
    t: number,
    sweepCol: number,
    show: Show,
    noisy: boolean,
    top: number,
    bottom: number,
  ) => {
    const mid = (top + bottom) / 2;
    const span = (bottom - top) / 2;

    for (let c = 0; c < cols; c++) {
      const done = c < sweepCol;

      const envelope =
        0.2 + 0.8 * noise(c * 0.05, 0.5) * (0.6 + 0.4 * Math.sin(c * 0.013));

      const tone = envelope * (0.55 + 0.45 * Math.abs(Math.sin(c * 0.45 + t * 4)));
      const jitter = clamp(tone + (hash(c, Math.floor(t * 14)) - 0.5) * 0.8);
      const amplitude = noisy && !done ? jitter : done ? tone : tone * 0.9;
      const half = amplitude * span;

      for (let r = top; r <= bottom; r++) {
        if (!show(c, r)) continue;

        if (Math.abs(r - mid) <= half)
          put(c, r, done ? "|" : "!", done ? 0 : 1, done ? 0.75 : 0.4);
        else if (noisy && !done && hash(c + Math.floor(t * 10), r) > 0.86)
          put(c, r, ".", 1, 0.35);
      }
    }
  };

  const drawVideo = (t: number, sweepCol: number, show: Show) => {
    const top = 4;
    const frameRows = rows - top - 3;
    const frameCols = Math.max(8, Math.round((frameRows * CH * 0.8) / CW));
    const pitch = frameCols + 3;

    for (let c = 0; c < cols; c++) {
      const done = c < sweepCol;

      // Sprocket holes along both edges of the strip.
      if (c % 3 === 1) {
        if (show(c, top - 2)) put(c, top - 2, "o", 1, 0.5);

        if (show(c, rows - 1)) put(c, rows - 1, "o", 1, 0.5);
      }

      const f = Math.floor(c / pitch);
      const fc = c - f * pitch;

      if (fc === frameCols + 1) {
        for (let r = top - 1; r < rows - 1; r++)
          if (show(c, r)) put(c, r, "|", 1, 0.35);
        continue;
      }

      if (fc >= frameCols) continue;

      for (let fr = 0; fr < frameRows; fr++) {
        const r = fr + top;

        if (!show(c, r)) continue;
        // Each frame shows the same shot, shifted a little.
        const aspect = (frameRows * CH) / (frameCols * CW);
        const u = 0.45 + Math.sin(f * 0.9) * 0.025 + ((fc + 0.5) / frameCols - 0.5) * 0.66;
        const v = 0.36 + ((fr + 0.5) / frameRows - 0.5) * 0.66 * aspect;
        const { dark, subject } = portraitAt(u, v);
        // Before: a flickering source. After: a clean frame.
        const value = done ? dark : dark + (hash(c + Math.floor(t * 9), r) - 0.5) * 0.3;

        put(
          c,
          r,
          glyph(subject ? value : value * 0.75, c, r),
          subject ? 0 : 1,
          subject ? (done ? 0.85 : 0.55) : 0.28,
        );
      }
    }
  };

  const drawParse = (sweepRow: number, show: Show) => {
    // Document columns fill the hero; each starts at a different line.
    const columnWidth = 44;

    for (let k = 0; k * columnWidth < cols; k++) {
      const c0 = k * columnWidth + 4;

      for (let line = 0, r = 4; r < rows - 1; line++, r += 2) {
        const text = DOCUMENT[(line + k * 5) % DOCUMENT.length] ?? "";
        const done = r < sweepRow;
        const heading = text.startsWith("#") || text.startsWith("**");

        [...text].forEach((ch, j) => {
          if (j >= columnWidth - 4 || !show(c0 + j, r)) return;

          if (done) put(c0 + j, r, ch, heading ? 2 : 0, heading ? 0.9 : 0.7);
          else if (ch !== " ") put(c0 + j, r, "~", 1, 0.45);
        });
      }
    }
  };

  const drawMerge = (sweep: number, show: Show) => {
    // Four separate PDFs slide together into one stacked document.
    const pageRows = Math.max(12, Math.floor(rows * 0.6));

    const pageCols = Math.min(
      Math.round((pageRows * CH * 0.72) / CW),
      Math.floor(cols / 4.6),
    );

    const progress = ease(clamp(sweep));
    const stackX = Math.round(cols * 0.62 - pageCols / 2);
    const stackY = Math.round((rows - pageRows) / 2);
    const taken = new Uint8Array(cols * rows);

    // Front page first, so pages behind it are covered.
    for (let page = MERGE_FILES.length - 1; page >= 0; page--) {
      const spreadX = Math.round(((page + 0.5) * cols) / MERGE_FILES.length - pageCols / 2);
      const spreadY = stackY + ([-3, 2, -1, 3][page % 4] ?? 0);
      const x0 = Math.round(spreadX + (stackX + page * 2 - spreadX) * progress);
      const y0 = Math.round(spreadY + (stackY + page - spreadY) * progress);
      const merged = progress >= 1;

      const title = merged
        ? `merged.pdf  ${page + 1}/${MERGE_FILES.length}`
        : (MERGE_FILES[page] ?? "");

      for (let pr = 0; pr < pageRows; pr++) {
        for (let pc = 0; pc < pageCols; pc++) {
          const c = x0 + pc;
          const r = y0 + pr;

          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const slot = r * cols + c;

          if (taken[slot] || !show(c, r)) continue;
          taken[slot] = 1;
          const edgeX = pc === 0 || pc === pageCols - 1;
          const edgeY = pr === 0 || pr === pageRows - 1;

          if (edgeX && edgeY) put(c, r, "+", 1, 0.6);
          else if (edgeY) put(c, r, "-", 1, 0.5);
          else if (edgeX) put(c, r, "|", 1, 0.5);
          else if (pr === 2 && pc >= 2 && pc - 2 < title.length)
            put(c, r, title[pc - 2] ?? " ", merged ? 2 : 0, 0.9);
          else if (pr >= 5 && pr < pageRows - 2 && pr % 2 === 1 && pc >= 2 && pc < pageCols - 2) {
            const wordBreak = noise(pc * 0.4 + page * 7, pr) > 0.72;
            const lineEnd = pc > pageCols - 4 - Math.floor(hash(page, pr) * pageCols * 0.4);

            if (!wordBreak && !lineEnd) put(c, r, "~", 1, 0.4);
          }
        }
      }
    }
  };

  // Transcript in readable type along the bottom of the hero.
  const drawTranscript = (reveal: number, alpha: number) => {
    ctx.font = `15px ${mono}`;
    ctx.textBaseline = "alphabetic";
    const y = height - 34;
    const maxWidth = width - 48;
    let shown = TRANSCRIPT.slice(0, reveal);

    // Keep the newest words in view when the line outgrows the hero.
    while (shown.length > 0 && ctx.measureText(shown).width > maxWidth)
      shown = shown.slice(1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors[0];
    ctx.fillText(shown, 24, y);

    if (reveal > 0 && reveal < TRANSCRIPT.length) {
      ctx.fillStyle = colors[2];
      ctx.fillRect(24 + ctx.measureText(shown).width + 2, y - 13, 8, 16);
    }
  };

  const drawLabel = (phase: ScenePhase, life: number) => {
    const x = 24;
    const y = 18;
    const total = String(SCENES.length).padStart(2, "0");
    const counter = `[ ${String(phase.index + 1).padStart(2, "0")} / ${total} ]`;
    const name = `${phase.scene.name} · ${phase.scene.media}`;
    ctx.font = `11px ${mono}`;
    ctx.textBaseline = "top";
    // Clear a strip so the scene never runs through the label.
    ctx.globalAlpha = 1;
    ctx.clearRect(x - 8, y - 6, Math.min(420, width - x), 24);
    ctx.globalAlpha = life;
    ctx.fillStyle = colors[1];
    ctx.fillText(counter, x, y);
    const nameX = x + ctx.measureText(counter).width + 10;
    ctx.fillStyle = colors[0];
    ctx.fillText(name, nameX, y);
    const finished = clamp((phase.sweep - 0.98) / 0.02);

    // On narrow screens the result would not fit after the name.
    if (finished > 0 && width > 520) {
      ctx.globalAlpha = life * finished;
      ctx.fillStyle = colors[2];

      ctx.fillText(
        phase.scene.result,
        nameX + ctx.measureText(name).width + 16,
        y,
      );
    }
  };

  const draw = (seconds: number) => {
    const phase = scenePhase(seconds);
    const { appear, vanish, sweep, time } = phase;
    const life = Math.min(appear, 1 - vanish);

    const show: Show = (c, r) => {
      const h = hash(c * 0.37, r * 0.71);

      return h <= appear && h >= vanish;
    };

    const sweepCol = Math.floor(sweep * (cols + 1));
    const sweepRow = Math.floor(sweep * (rows + 1));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    switch (phase.scene.id) {
      case "remove":
        drawPhoto(sweepCol, show, (done) => (done ? "cut" : "fine"));
        break;
      case "compress":
        drawPhoto(sweepCol, show, (done) => (done ? "coarse" : "fine"));
        break;
      case "upscale":
        drawPhoto(sweepCol, show, (done) => (done ? "fine" : "coarse"));
        break;
      case "transcribe":
        drawWave(time, sweepCol, show, false, Math.floor(rows * 0.06), Math.floor(rows * 0.34));
        drawTranscript(Math.floor(sweep * TRANSCRIPT.length), life);
        break;
      case "denoise":
        drawWave(time, sweepCol, show, true, Math.floor(rows * 0.1), Math.floor(rows * 0.9));
        break;
      case "video":
        drawVideo(time, sweepCol, show);
        break;
      case "parse":
        drawParse(sweepRow, show);
        break;
      case "merge":
        drawMerge(sweep, show);
        break;
    }

    // The scan line, on the character grid.
    if (sweep > 0 && sweep < 1) {
      if (phase.scene.id === "parse")
        for (let c = 0; c < cols; c++) put(c, sweepRow, "-", 2, 1);
      else for (let r = 0; r < rows; r++) put(sweepCol, r, "|", 2, 1);
    }

    drawLabel(phase, life);
    ctx.globalAlpha = 1;
    canvas.dataset.rendered = "true";
  };

  function tick(now: number) {
    elapsed += Math.min(now - previous, 100);
    previous = now;

    if (now - painted >= FRAME_MS) {
      draw(elapsed / 1000);
      painted = now;
    }

    frame = requestAnimationFrame(tick);
  }

  function updatePlayback() {
    cancelAnimationFrame(frame);
    frame = 0;
    const showing = visible && !document.hidden;
    canvas.dataset.motion = showing && !motion.matches ? "playing" : "paused";

    if (showing && !motion.matches) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (showing) {
      draw(REDUCED_MOTION_ELAPSED);
    }
  }

  const resize = new ResizeObserver(() => {
    measure();

    if (visible && !document.hidden)
      draw(motion.matches ? REDUCED_MOTION_ELAPSED : elapsed / 1000);
  });

  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    updatePlayback();
  });

  resize.observe(canvas);

  // The calm and hidden areas move when the content around them resizes.
  for (const element of [...targets.calm(), ...targets.hide()]) resize.observe(element);
  intersection.observe(canvas);
  motion.addEventListener("change", updatePlayback);
  document.addEventListener("visibilitychange", updatePlayback);

  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    motion.removeEventListener("change", updatePlayback);
    document.removeEventListener("visibilitychange", updatePlayback);
  };
}
