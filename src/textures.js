// Procedural canvas textures: wood grain, amber clouds, tassel fringe, the prayer rug
// (field, border, corners) and the wall's glazed tiles. Colours come from palette.js.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { RUG_HEX as D, TILE_HEX as T } from './palette.js';
import { clamp, rng, RNG_SEED, RNG_SKIP } from './physics.js';

// world sizes, shared with scene.js, which lays the rug out
export const RUG = {
  tile: 0.8,        // field pattern repeat: a star is about 8 beads across
  border: 1.2,      // total border width
  period: 1.6,      // border motif repeat along its length (two field tiles)
};
export const WALL_TILE = 1.4;   // star-and-cross repeat on the wall
const PX = 640;                 // border texture pixels per world unit: crisp even up close

export function makeTextures(renderer) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const aniso = Math.min(8, maxAniso);
  function canvasTex(w, h, draw, anisotropy = aniso) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  }

  // wood grain: rings around the bore (sphere v runs pole to pole along the thread)
  const grain = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const warp = Math.sin(u * Math.PI * 4 + v * 9) * 0.018 + Math.sin(u * Math.PI * 10 + 1.3) * 0.008;
      const ring = Math.pow(0.5 + 0.5 * Math.sin((v + warp) * 38 * Math.PI * 2), 6);
      const fine = 0.5 + 0.5 * Math.sin((v + warp * 1.6) * 260);
      const L = clamp(0.98 - ring * 0.34 - fine * 0.06, 0, 1);
      const k = (y * w + x) * 4;
      img.data[k] = 255 * L; img.data[k + 1] = 245 * L; img.data[k + 2] = 232 * L; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });

  // amber: soft cloudy inclusions, wrapped so the seam is invisible
  const cloud = canvasTex(256, 128, (g, w, h) => {
    const R = rng(RNG_SEED, RNG_SKIP.cloud);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const x = R() * w, y = R() * h, r = 6 + R() * 26, dark = R() < 0.55;
      for (const dx of [-w, 0, w]) {
        const grd = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        grd.addColorStop(0, dark ? 'rgba(140,60,15,.24)' : 'rgba(255,238,196,.4)');
        grd.addColorStop(1, dark ? 'rgba(140,60,15,0)' : 'rgba(255,238,196,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x + dx, y, r, 0, 7); g.fill();
      }
    }
  });

  const fringe = canvasTex(128, 8, (g, w, h) => {
    const R = rng(RNG_SEED, RNG_SKIP.fringe);
    for (let x = 0; x < w; x++) { const L = (0.62 + R() * 0.38) * 255 | 0; g.fillStyle = `rgb(${L},${L},${L})`; g.fillRect(x, 0, 1, h); }
  });

  // the rug's field: an interlaced eight-point-star pattern, built the classical way
  // (Hankin's "polygons in contact"): take the tiling of octagons and squares, send two
  // rays from the middle of every edge at 72°, and stop each ray where it meets its
  // neighbour. That gives the eight-point star-and-cross, whose lines run on unbroken from
  // tile to tile as woven bands.
  const field = canvasTex(1024, 1024, (g, w) => drawField(g, w), maxAniso);
  field.wrapS = field.wrapT = RepeatWrapping;
  const border = canvasTex(RUG.period * PX, RUG.border * PX, drawBorder, maxAniso);
  border.wrapS = RepeatWrapping;
  const corner = canvasTex(RUG.border * PX, RUG.border * PX, drawCorner, maxAniso);
  const tiles = canvasTex(1024, 1024, drawTiles, maxAniso);
  tiles.wrapS = tiles.wrapT = RepeatWrapping;

  return { grain, cloud, fringe, field, border, corner, tiles };
}

// ── the field ──
// colours (palette.js records each one's dye and the rules they pass)
const FIELD = {
  petal: D.madder,      // the rosette petals: most of the field
  star: D.indigo,       // the eight-point stars
  cross: D.weld,        // the small four-point stars
  heart: D.green,       // Paradise green at the heart of each star
  band: D.greyWool,     // natural grey wool strapwork
  edge: D.walnut,       // walnut-brown outlines
};
const THETA = 72 * Math.PI / 180;   // contact angle: sharp eight-point stars ringed by rosette petals

// a regular n-gon's Hankin construction. Returns, for each edge k, its midpoint m[k] and
// the point p[k] where the ray from m[k] meets the ray from m[k+1] (on the line from the
// shared vertex to the centre).
function hankin(n, cx, cy, side, rot, theta = THETA) {
  const R = side / (2 * Math.sin(Math.PI / n)), half = side / 2;
  const alpha = (n - 2) * Math.PI / n;
  const reach = half * Math.sin(theta) / Math.sin(Math.PI - theta - alpha / 2);
  const v = [], m = [], p = [];
  for (let k = 0; k < n; k++) { const a = rot + 2 * Math.PI * k / n; v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  for (let k = 0; k < n; k++) { const a = v[k], b = v[(k + 1) % n]; m.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
  for (let k = 0; k < n; k++) {
    const w = v[(k + 1) % n], dx = cx - w[0], dy = cy - w[1], d = Math.hypot(dx, dy);
    p.push([w[0] + dx / d * reach, w[1] + dy / d * reach]);
  }
  return { m, p, n };
}

export function drawField(g, a, theta = THETA) {
  const side = a / (1 + Math.SQRT2);
  // octagons (flat edges facing the axes) at the tile corners, a square (as a diamond) in the middle
  const polys = [];
  for (const [x, y] of [[0, 0], [a, 0], [0, a], [a, a]]) polys.push(hankin(8, x, y, side, Math.PI / 8, theta));
  polys.push(hankin(4, a / 2, a / 2, side, 0, theta));
  const star = h => { g.beginPath(); for (let k = 0; k < h.n; k++) { const m = h.m[k], p = h.p[k]; k ? g.lineTo(m[0], m[1]) : g.moveTo(m[0], m[1]); g.lineTo(p[0], p[1]); } g.closePath(); };

  g.fillStyle = FIELD.petal; g.fillRect(0, 0, a, a);
  for (const h of polys) { g.fillStyle = h.n === 8 ? FIELD.star : FIELD.cross; star(h); g.fill(); }

  // a small green star in the heart of each large one: the garden at the centre
  g.lineWidth = a / 400; g.strokeStyle = FIELD.edge;
  for (const [x, y] of [[0, 0], [a, 0], [0, a], [a, a]]) {
    const h = hankin(8, x, y, side * 0.34, Math.PI / 8, theta);
    g.fillStyle = FIELD.heart; star(h); g.fill(); g.stroke();
  }

  // strapwork: dark edges everywhere first, then the wool bands, so crossings stay clean
  const bw = a / 52, edge = a / 200;
  g.lineJoin = 'miter'; g.lineCap = 'butt';
  for (const [col, width] of [[FIELD.edge, bw + 2 * edge], [FIELD.band, bw]]) {
    g.strokeStyle = col; g.lineWidth = width;
    for (const h of polys) { star(h); g.stroke(); }
  }
  // interlace: at every edge midpoint two bands cross. The band leaving along the ray
  // toward the next vertex goes over. Following any one band, its crossings then
  // alternate over, under, over, and the rule agrees on both sides of every shared edge.
  const piece = bw * 1.25;
  for (const [col, width] of [[FIELD.edge, bw + 2 * edge], [FIELD.band, bw]]) {
    g.strokeStyle = col; g.lineWidth = width;
    for (const h of polys) for (let k = 0; k < h.n; k++) {
      const m = h.m[k], p = h.p[k], dx = p[0] - m[0], dy = p[1] - m[1], d = Math.hypot(dx, dy);
      const ux = dx / d * piece, uy = dy / d * piece;
      g.beginPath(); g.moveTo(m[0] - ux, m[1] - uy); g.lineTo(m[0] + ux, m[1] + uy); g.stroke();
    }
  }
  wool(g, a, a, 1);
}

// wool: a faint, static grain so flat colours read as pile, not paint
function wool(g, w, h, seed) {
  const R = rng(RNG_SEED + seed, RNG_SKIP.rug);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 10; d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.7; }
  g.putImageData(img, 0, 0);
}

// a 16-point outline alternating between an outer and inner radius (an eight-point star)
function octagram(g, cx, cy, ro, ri, rot = 0) {
  g.beginPath();
  for (let k = 0; k < 16; k++) { const r = k % 2 ? ri : ro, a = rot + k * Math.PI / 8; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); k ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}

// ── the border ──
// its layers from the outer edge inward, in world units: [from, to, colour]
const BORDER_BANDS = [
  [0, 0.03, D.walnut],          // selvage line
  [0.03, 0.15, D.pomegranate],  // outer guard
  [0.15, 0.18, D.walnut],
  [0.18, 1.02, D.skyIndigo],    // main border: the lighter ground
  [1.02, 1.05, D.walnut],
  [1.05, 1.17, D.madderPale],   // inner guard
  [1.17, 1.2, D.walnut],
];

// border strip: canvas x runs along the rug edge, y from the outer edge (0) in to the field.
// Motif: indigo stars with green hearts, alternating with madder lozenges.
function drawBorder(g, w, h) {
  const u = h / RUG.border;
  for (const [a, b, c] of BORDER_BANDS) { g.fillStyle = c; g.fillRect(0, a * u, w, (b - a) * u + 1); }
  guardDots(g, 0, w, 0.09 * u, u, D.madderPale);
  guardDots(g, 0, w, 1.11 * u, u, D.weld);
  const cy = 0.6 * u;
  borderStar(g, w / 4, cy, u); borderStar(g, 3 * w / 4, cy, u);
  for (const x of [0, w / 2, w]) lozenge(g, x, cy, u);
  wool(g, w, h, 2);
}
function borderStar(g, x, y, u) {
  g.lineJoin = 'miter'; g.lineWidth = 0.012 * u; g.strokeStyle = D.walnut;
  g.fillStyle = D.indigo; octagram(g, x, y, 0.34 * u, 0.24 * u, Math.PI / 8); g.fill(); g.stroke();
  g.fillStyle = D.green; octagram(g, x, y, 0.13 * u, 0.08 * u, Math.PI / 8); g.fill(); g.stroke();
}
function lozenge(g, x, y, u) {
  g.lineWidth = 0.012 * u; g.strokeStyle = D.walnut; g.fillStyle = D.madderPale;
  g.beginPath(); g.moveTo(x, y - 0.3 * u); g.lineTo(x + 0.13 * u, y); g.lineTo(x, y + 0.3 * u); g.lineTo(x - 0.13 * u, y); g.closePath(); g.fill(); g.stroke();
}
function guardDots(g, x0, x1, y, u, colour) {
  g.fillStyle = colour;
  for (let x = x0 + 0.1 * u; x < x1; x += 0.2 * u) { g.beginPath(); g.moveTo(x, y - 0.035 * u); g.lineTo(x + 0.035 * u, y); g.lineTo(x, y + 0.035 * u); g.lineTo(x - 0.035 * u, y); g.closePath(); g.fill(); }
}

// corner square: outer edges along the top and left, the field at the bottom-right.
// The outer guard turns the corner as an L; the inner guards meet in the far corner.
function drawCorner(g, w) {
  const u = w / RUG.border;
  g.fillStyle = D.skyIndigo; g.fillRect(0, 0, w, w);
  for (const [a, b, c] of BORDER_BANDS) {
    g.fillStyle = c;
    if (a >= 1.02) g.fillRect(a * u, a * u, w - a * u, w - a * u);
    else if (a < 0.18) { g.fillRect(a * u, a * u, w - a * u, (b - a) * u + 1); g.fillRect(a * u, a * u, (b - a) * u + 1, w - a * u); }
  }
  borderStar(g, 0.6 * u, 0.6 * u, u);
  wool(g, w, w, 3);
}

// ── the wall: Ilkhanid star-and-cross tiles ──
// Each eight-point star is two overlapping squares (half-side q). The stars sit on a
// checkerboard, and the spaces left between them are exactly the cross tiles.
function drawTiles(g, a) {
  const q = a / 4;
  // outer points at q·√2; inner corners where the two squares' edges cross, at q·1.0824 (22.5°)
  const star = (x, y) => octagram(g, x, y, q * Math.SQRT2, q * Math.hypot(1, Math.SQRT2 - 1), 0);
  g.fillStyle = T.turquoise; g.fillRect(0, 0, a, a);
  const centres = [[0, 0], [a, 0], [0, a], [a, a], [a / 2, a / 2]];
  g.lineJoin = 'miter'; g.lineWidth = a / 170; g.strokeStyle = T.grout;
  for (const [x, y] of centres) { g.fillStyle = T.cobalt; star(x, y); g.fill(); g.stroke(); }
  for (const [x, y] of centres) { g.fillStyle = T.tinWhite; octagram(g, x, y, q * 0.34, q * 0.2, Math.PI / 8); g.fill(); }
}
