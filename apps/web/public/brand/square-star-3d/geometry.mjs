// The outer square is a fixed field. Only the inner star receives a 3D transform.
const TAU = Math.PI * 2;

const HALF_DEPTH = 0.055;

const axisLength = Math.hypot(0.22, 1, 0.12);

const AXIS = { x: 0.22 / axisLength, y: 1 / axisLength, z: 0.12 / axisLength };

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotate(point, phase) {
  if (phase <= 0 || phase >= 1) return { ...point };
  const eased = phase * phase * phase * (phase * (phase * 6 - 15) + 10);
  const angle = -TAU * eased;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const along = dot(AXIS, point) * (1 - c);

  return {
    x: point.x * c + (AXIS.y * point.z - AXIS.z * point.y) * s + AXIS.x * along,
    y: point.y * c + (AXIS.z * point.x - AXIS.x * point.z) * s + AXIS.y * along,
    z: point.z * c + (AXIS.x * point.y - AXIS.y * point.x) * s + AXIS.z * along,
  };
}

function project(point) {
  return { x: point.x, y: -point.y };
}

const square = [
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

const star = [];

for (let quarter = 0; quarter < 4; quarter += 1) {
  const angle = quarter * Math.PI / 2;

  for (let step = 0; step < 40; step += 1) {
    const t = step / 40;
    const u = 1 - t;
    const x = 3 * u * t * t * 0.39 + t * t * t * 0.875;
    const y = u * u * u * 0.875 + 3 * u * u * t * 0.39;
    star.push({
      x: x * Math.cos(angle) + y * Math.sin(angle),
      y: y * Math.cos(angle) - x * Math.sin(angle),
    });
  }
}

const faces = [
  { points: star.map(point => ({ ...point, z: HALF_DEPTH })), normal: { x: 0, y: 0, z: 1 }, kind: 'cutout' },
  { points: star.map(point => ({ ...point, z: -HALF_DEPTH })), normal: { x: 0, y: 0, z: -1 }, kind: 'cutout' },
];

for (let index = 0; index < star.length; index += 1) {
  const first = star[index];
  const second = star[(index + 1) % star.length];

  if (!first || !second) continue;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  faces.push({
    points: [
      { ...first, z: HALF_DEPTH },
      { ...second, z: HALF_DEPTH },
      { ...second, z: -HALF_DEPTH },
      { ...first, z: -HALF_DEPTH },
    ],
    normal: { x: -dy / length, y: dx / length, z: 0 },
    kind: 'wall',
  });
}

export function makeFrame(phase, dark = false) {
  const visible = [];

  for (const face of faces) {
    const normal = rotate(face.normal, phase);

    if (normal.z <= 0.000001) continue;
    visible.push({ points: face.points.map(point => project(rotate(point, phase))), kind: face.kind });
  }

  const walls = visible.filter(face => face.kind === 'wall');
  const caps = visible.filter(face => face.kind === 'cutout');
  const result = [{ points: square.map(project), loops: [], color: dark ? '#f4f4f4' : '#262626', kind: 'field' }];

  if (walls.length > 0) {
    result.push({ points: [], loops: walls.map(face => face.points), color: dark ? '#505050' : '#adadad', kind: 'wall' });
  }

  for (const cap of caps) result.push({ ...cap, loops: [], color: '#000000' });

  return result;
}

export function drawFrame(context, width, height, phase, dark, coverage = 0.65) {
  const scale = Math.min(width, height) * coverage / 2;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(scale, scale);

  for (const face of makeFrame(phase, dark)) {
    context.beginPath();

    for (const contour of [face.points, ...face.loops]) {
      if (contour.length === 0) continue;

      for (let index = 0; index < contour.length; index += 1) {
        const point = contour[index];

        if (!point) continue;

        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      context.closePath();
    }

    // The front remains a real transparent opening in the static square.
    context.globalCompositeOperation = face.kind === 'cutout' ? 'destination-out' : 'source-over';
    context.fillStyle = face.color;
    context.fill('nonzero');
  }

  context.restore();
}

export function frameSvg(phase, { width = 480, height = 400, dark = false, background = true, coverage = 0.65 } = {}) {
  const scale = Math.min(width, height) * coverage / 2;
  const transform = `translate(${width / 2} ${height / 2}) scale(${scale})`;
  const path = contour => contour.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(6)} ${point.y.toFixed(6)}`).join('') + (contour.length ? 'Z' : '');
  const frame = makeFrame(phase, dark);
  const paint = frame.filter(face => face.kind !== 'cutout').map(face => `<path d="${path(face.points)}${face.loops.map(path).join('')}" fill="${face.color}"/>`).join('');
  const aperture = frame.filter(face => face.kind === 'cutout').map(face => `<path d="${path(face.points)}" fill="black"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Fixed square with an animated star"><defs><mask id="star-opening" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g transform="${transform}">${aperture}</g></mask></defs>${background ? `<rect width="100%" height="100%" fill="${dark ? '#181818' : '#fafafa'}"/>` : ''}<g mask="url(#star-opening)"><g transform="${transform}">${paint}</g></g></svg>`;
}
