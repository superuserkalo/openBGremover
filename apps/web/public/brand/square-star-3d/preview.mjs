import { drawFrame } from './geometry.mjs';

const DURATION = 1520;

const HOLD = 750;

const reducedPreference = matchMedia('(prefers-reduced-motion: reduce)');

const stage = document.querySelector('#stage-trigger');

const header = document.querySelector('#header-trigger');

const play = document.querySelector('#play');

const speed = document.querySelector('#speed');

const repeat = document.querySelector('#repeat');

const timeline = document.querySelector('#timeline');

const time = document.querySelector('#time');

const status = document.querySelector('#status');

const theme = document.querySelector('#theme');

const reduce = document.querySelector('#reduce');

const reducedNote = document.querySelector('#reduced-note');

if (!stage || !header || !play || !speed || !repeat || !timeline || !time || !status || !theme || !reduce || !reducedNote) {
  throw new Error('The motion preview is missing a required control.');
}

const surfaces = [];

for (const canvas of document.querySelectorAll('canvas[data-tile]')) {
  const context = canvas.getContext('2d');

  if (!context) continue;
  const coverage = Number(canvas.dataset.coverage);

  if (!Number.isFinite(coverage) || coverage <= 0 || coverage > 1) continue;
  surfaces.push({ canvas, context, coverage });
}

let phase = 0;

let dark = false;

let playing = false;

let raf = 0;

let holdTimer = 0;

let mainHovered = false;

let headerHovered = false;

let startTime = 0;

let playbackRate = 1;

function render() {
  for (const surface of surfaces) {
    const bounds = surface.canvas.getBoundingClientRect();
    const density = Math.min(devicePixelRatio || 1, 3);
    const width = Math.round(bounds.width * density);
    const height = Math.round(bounds.height * density);

    if (width === 0 || height === 0) continue;

    if (surface.canvas.width !== width || surface.canvas.height !== height) {
      surface.canvas.width = width;
      surface.canvas.height = height;
    }

    drawFrame(surface.context, width, height, phase, dark, surface.coverage);
    surface.canvas.dataset.phase = String(phase);
    surface.canvas.parentElement?.classList.add('rendered');
  }
}

function updateTransport() {
  timeline.value = String(Math.round(phase * 1000));
  time.textContent = `${(phase * DURATION / 1000).toFixed(2)} s`;
  timeline.setAttribute('aria-valuetext', `${Math.round(phase * 100)} percent through the turn`);
  play.disabled = playing || reduce.checked;
  play.setAttribute('aria-busy', String(playing));
}

function clearHold() {
  clearTimeout(holdTimer);
  holdTimer = 0;
}

function queueReplay() {
  clearHold();

  if (!reduce.checked && (repeat.checked || mainHovered || headerHovered)) {
    holdTimer = window.setTimeout(start, HOLD);
  }
}

function step(now) {
  phase = Math.min(1, (now - startTime) * playbackRate / DURATION);
  render();
  updateTransport();

  if (phase < 1) {
    raf = requestAnimationFrame(step);
  } else {
    playing = false;
    raf = 0;
    // Rendering phase 1 uses the identity transform, exactly as phase 0 does.
    status.textContent = 'Resting';
    updateTransport();
    queueReplay();
  }
}

function start() {
  clearHold();

  if (playing || reduce.checked || document.hidden) return;
  const selectedRate = Number(speed.value);
  playbackRate = selectedRate === 0.35 ? 0.35 : 1;
  phase = 0;
  playing = true;
  startTime = performance.now();
  status.textContent = 'Turning';
  updateTransport();
  raf = requestAnimationFrame(step);
}

function stopAtRest() {
  clearHold();
  cancelAnimationFrame(raf);
  raf = 0;
  playing = false;
  phase = 0;
  status.textContent = 'Resting';
  render();
  updateTransport();
}

for (const [element, setHover] of [
  [stage, value => { mainHovered = value; }],
  [header, value => { headerHovered = value; }],
]) {
  element.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    setHover(true);
    start();
  });
  element.addEventListener('pointerleave', () => {
    setHover(false);

    if (!mainHovered && !headerHovered && !repeat.checked) clearHold();
  });
  element.addEventListener('click', start);
}

play.addEventListener('click', start);

repeat.addEventListener('change', () => {
  if (repeat.checked) start();
  else if (!mainHovered && !headerHovered) clearHold();
});

timeline.addEventListener('input', () => {
  clearHold();
  cancelAnimationFrame(raf);
  raf = 0;
  playing = false;
  const value = Number(timeline.value);
  phase = reduce.checked ? 0 : Math.min(1, Math.max(0, value / 1000));
  status.textContent = phase === 0 || phase === 1 ? 'Resting' : 'Inspecting frame';
  render();
  updateTransport();
});

theme.addEventListener('click', () => {
  dark = !dark;
  document.body.classList.toggle('dark', dark);
  theme.setAttribute('aria-pressed', String(dark));
  theme.setAttribute('aria-label', dark ? 'Switch to light background' : 'Switch to dark background');
  theme.innerHTML = `${dark ? 'Light' : 'Dark'} background <span aria-hidden="true">◐</span>`;
  render();
});

function applyReducedMotion() {
  reducedNote.hidden = !reduce.checked;
  timeline.disabled = reduce.checked;
  repeat.disabled = reduce.checked;

  if (reduce.checked) stopAtRest();
  updateTransport();
}

reduce.checked = reducedPreference.matches;

reduce.addEventListener('change', applyReducedMotion);

reducedPreference.addEventListener('change', event => {
  reduce.checked = event.matches;
  applyReducedMotion();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAtRest();
});

const observer = new ResizeObserver(render);

for (const surface of surfaces) observer.observe(surface.canvas);

window.addEventListener('pagehide', () => {
  observer.disconnect();
  clearHold();
  cancelAnimationFrame(raf);
}, { once: true });

render();

applyReducedMotion();
