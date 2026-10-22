// WebGPU version of components/marketing/signal-field.ts. Keep in step with it.
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  time: f32,
  cell: f32,
  presence: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const BAR_GLYPH = 4329604u;
const PLUS_GLYPH = 145536u;
const SWEEP_PERIOD = 9.0;
const RETICLE_RADIUS = 0.1;
const GRAY = vec3f(0.45);
const ORANGE = vec3f(0.98, 0.294, 0.0);
const CHECKER = vec3f(0.55);

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let top = mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x);
  let bottom = mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x);
  return mix(top, bottom, u.y);
}

fn fbm(p: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var q = p;
  for (var octave = 0; octave < 3; octave++) {
    value += amplitude * noise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value / 0.875;
}

// 5×5 bitmap lookup; the glyph fills the top-left 5/6 of the cell.
fn glyph_bit(mask: u32, local: vec2f) -> f32 {
  let dots = floor(local / (params.cell / 6.0));
  if (dots.x > 4.0 || dots.y > 4.0) { return 0.0; }
  let index = u32(dots.y) * 5u + u32(dots.x);
  return f32((mask >> index) & 1u);
}

fn ink(color: vec3f, alpha: f32) -> vec4f {
  return vec4f(color * alpha, alpha);
}

fn checker(cell: vec2f, local: vec2f) -> vec4f {
  let inset = params.cell * 5.0 / 6.0;
  if (local.x >= inset || local.y >= inset) { return vec4f(0.0); }
  let strong = (u32(cell.x) + u32(cell.y)) % 2u == 0u;
  return ink(CHECKER, select(0.045, 0.1, strong));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var glyphs = array<u32, 8>(0u, 4096u, 131200u, 14336u, 145536u, 332096u, 4685252u, 11512810u);
  var bayer = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

  let px = uv * params.resolution;
  let cell = floor(px / params.cell);
  let local = px - cell * params.cell;
  let center = (cell + 0.5) * params.cell;
  let height = params.resolution.y;
  let p = center / height;
  let t = params.time;
  let cell_hash = hash(cell + 0.37);
  let unit = params.cell / height;

  // Pointer reticle: rotating tick ring, cut-out interior, centre mark.
  if (params.presence > 0.0 && cell_hash < params.presence) {
    let d = (center - params.pointer) / height;
    let radius = length(d);
    let ring_width = unit * 0.75;
    if (radius < unit * 0.6) {
      return ink(ORANGE, glyph_bit(PLUS_GLYPH, local));
    }
    if (abs(radius - RETICLE_RADIUS) < ring_width) {
      let angle = atan2(d.y, d.x) + t * 0.8;
      if (fract(angle / 6.2831853 * 16.0) < 0.5) {
        return ink(ORANGE, 0.95 * glyph_bit(glyphs[7], local));
      }
    }
    if (radius < RETICLE_RADIUS - ring_width) {
      return checker(cell, local);
    }
  }

  let line = 0.86 + 0.045 * sin(p.x * 1.7 + t * 0.4) + 0.02 * sin(p.x * 4.3 - t * 0.7);
  let distance = (p.y - line) / 0.12;
  let band = exp(-distance * distance);
  if (band < 0.01) { return vec4f(0.0); }

  // Scan line: cells just behind it are cut out, then dither back in.
  let sweep = fract(t / SWEEP_PERIOD) * 1.6 - 0.3;
  let behind = sweep - center.x / params.resolution.x;
  let sweep_column = floor(sweep * params.resolution.x / params.cell);
  if (band > 0.2 && cell.x == sweep_column) {
    return ink(ORANGE, glyph_bit(BAR_GLYPH, local));
  }
  if (band > 0.25 && cell.x < sweep_column && behind / 0.38 < cell_hash) {
    return checker(cell, local);
  }

  let warp = vec2f(
    noise(p * 1.4 + vec2f(t * 0.07, 0.0)),
    noise(p * 1.4 + vec2f(4.3, -t * 0.05)),
  );
  let n = fbm(p * 2.6 + warp * 1.6 - vec2f(t * 0.11, 0.0));
  let value = min(1.0, smoothstep(0.32, 0.8, n) * band * 1.4);
  let threshold = (bayer[u32(cell.y) % 4u * 4u + u32(cell.x) % 4u] + 0.5) / 16.0;
  let level = u32(min(7.0, floor(value * 7.0 + threshold)));
  if (level == 0u) { return vec4f(0.0); }

  let bit = glyph_bit(glyphs[level], local);
  if (level >= 5u) {
    return ink(ORANGE, 0.9 * bit);
  }
  return ink(GRAY, (0.15 + f32(level) * 0.12) * bit);
}
