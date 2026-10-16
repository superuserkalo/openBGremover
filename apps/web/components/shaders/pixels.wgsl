struct Params {
  time: f32,
  aspect: f32,
  pointer: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let grid = vec2f(56.0 * params.aspect, 56.0);
  let cell = floor(uv * grid);
  let local = fract(uv * grid) - 0.5;
  let p = cell / grid;
  let t = params.time * 0.65;
  let wave = sin(p.x * 9.0 + t) * 0.13 + sin(p.x * 21.0 - t * 1.2) * 0.045;
  let band = exp(-pow((p.y - 0.54 - wave) * 4.2, 2.0));
  let ripple = sin(length((p - params.pointer) * vec2f(params.aspect, 1.0)) * 24.0 - t * 3.0) * 0.16;
  let hash = fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453);
  let density = clamp(band * (0.62 + 0.38 * sin(p.x * 7.0 + p.y * 8.0 + t)) + ripple * band, 0.0, 1.0);
  let dotShape = 1.0 - smoothstep(0.08, 0.18, length(local));
  let horizontal = (1.0 - step(0.30, abs(local.x))) * (1.0 - step(0.065, abs(local.y)));
  let vertical = (1.0 - step(0.065, abs(local.x))) * (1.0 - step(0.30, abs(local.y)));
  let cross = max(horizontal, vertical);
  let glyph = select(select(dotShape, horizontal, hash > 0.4), cross, hash > 0.72);
  let alpha = glyph * density * smoothstep(0.08, 0.4, hash) * 0.85;
  let ink = mix(vec3f(0.43), vec3f(1.0, 0.30, 0.0), smoothstep(0.4, 0.9, density));
  return vec4f(mix(vec3f(0.98), ink, alpha), 1.0);
}
