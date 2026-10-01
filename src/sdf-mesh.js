// Smooth shapes from distance functions. A signed distance function (SDF) says, for any
// point, how far it is from a surface (negative inside). Simple pieces (rounded cones,
// ellipsoids) combine with a *smooth* minimum, which blends them with a fillet instead of
// a crease, the way a carver leaves the stone between finger and palm.
//
// meshSDF turns an SDF into triangles by "surface nets": sample the function on a grid;
// every grid cell the surface passes through gets one vertex (the average of where the
// surface crosses its edges, then nudged onto the surface); every grid edge the surface
// crosses becomes a quad joining the four cells around it. Normals come from the SDF's
// gradient, so shading is smooth.
import { BufferAttribute, BufferGeometry } from 'three';

// ── pieces (iq's formulas) ──
// a cone with rounded ends: radius ra at a, rb at b
export function roundCone(a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yd = pax * bax + pay * bay + paz * baz, yy = yd - l2;
    const qx = pax * l2 - bax * yd, qy = pay * l2 - bay * yd, qz = paz * l2 - baz * yd;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yd * yd * l2, z2 = yy * yy * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(yy) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yd) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yd * rr) * il2 - ra;
  };
}
// an ellipsoid (a close bound, not exact; fine for smooth shapes)
export function ellipsoid(c, r) {
  return (x, y, z) => {
    const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / r[0], qy = py / r[1], qz = pz / r[2], k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(...r);
  };
}
// the smooth minimum: within k of each other, two surfaces blend
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// a list of [sdf, blend, sphere] pieces as one shape; each piece's blend is how far it
// fillets into the rest; sphere ([x, y, z, r], optional) encloses the piece, so a piece too
// far away to change the result is skipped
export function union(pieces) {
  return (x, y, z) => {
    let d = pieces[0][0](x, y, z);
    for (let i = 1; i < pieces.length; i++) {
      const [f, k, b] = pieces[i];
      if (b && Math.sqrt((x - b[0]) ** 2 + (y - b[1]) ** 2 + (z - b[2]) ** 2) - b[3] > d + k) continue;
      d = smin(d, f(x, y, z), k);
    }
    return d;
  };
}
// the sphere around a rounded cone, for union()
export const coneSphere = (a, b, ra, rb) => {
  const c = [0, 1, 2].map(i => (a[i] + b[i]) / 2), half = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
  return [...c, half + Math.max(ra, rb)];
};
// the box the pieces fill, from their own extents: [[minx,miny,minz],[maxx,maxy,maxz]]
export const bounds = (...boxes) => [0, 1, 2].map(i => [Math.min(...boxes.map(b => b[0][i])), Math.max(...boxes.map(b => b[1][i]))]);

// ── the mesher ──
// sdf: (x, y, z) => distance; box: [[x0,x1],[y0,y1],[z0,z1]]; cell: grid spacing
export function meshSDF(sdf, box, cell) {
  const o = box.map(b => b[0] - cell), n = box.map(b => Math.ceil((b[1] - b[0]) / cell) + 3);
  const [nx, ny, nz] = n, sx = 1, sy = nx, sz = nx * ny;
  // the distance at every grid point. Only points near the surface need it exactly: first
  // sample a grid four times coarser; where all eight coarse corners around a point are
  // further from the surface than the point can be from the nearest of them, the surface
  // can't pass between (a distance field changes no faster than distance), so the point
  // takes their blended value instead of a full evaluation
  const val = new Float32Array(nx * ny * nz), C = 4, cc = cell * C, far = cc * 0.9;   // 0.9: just over half the coarse cell's diagonal
  const mx = Math.ceil((nx - 1) / C) + 1, my = Math.ceil((ny - 1) / C) + 1, mz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(mx * my * mz);
  for (let k = 0, i = 0; k < mz; k++) for (let j = 0; j < my; j++) for (let h = 0; h < mx; h++, i++) coarse[i] = sdf(o[0] + h * cc, o[1] + j * cc, o[2] + k * cc);
  for (let k = 0, i = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let h = 0; h < nx; h++, i++) {
    const H = Math.min(Math.floor(h / C), mx - 2), J = Math.min(Math.floor(j / C), my - 2), K = Math.min(Math.floor(k / C), mz - 2);
    const c0 = H + J * mx + K * mx * my, dx = mx, dy = mx * my;
    const v000 = coarse[c0], v100 = coarse[c0 + 1], v010 = coarse[c0 + dx], v110 = coarse[c0 + 1 + dx];
    const v001 = coarse[c0 + dy], v101 = coarse[c0 + 1 + dy], v011 = coarse[c0 + dx + dy], v111 = coarse[c0 + 1 + dx + dy];
    const lo = Math.min(v000, v100, v010, v110, v001, v101, v011, v111), hi = Math.max(v000, v100, v010, v110, v001, v101, v011, v111);
    if (lo > far || hi < -far) {
      const fx = h / C - H, fy = j / C - J, fz = k / C - K;
      const a = v000 + (v100 - v000) * fx, b = v010 + (v110 - v010) * fx, c = v001 + (v101 - v001) * fx, d = v011 + (v111 - v011) * fx;
      const e = a + (b - a) * fy, f = c + (d - c) * fy;
      val[i] = e + (f - e) * fz;
    } else val[i] = sdf(o[0] + h * cell, o[1] + j * cell, o[2] + k * cell);
  }

  // one vertex per cell the surface crosses (corner c of a cell is at offset (c&1, c>>1&1, c>>2))
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const off = Int32Array.from({ length: 8 }, (_, c) => (c & 1) * sx + (c >> 1 & 1) * sy + (c >> 2) * sz);
  const E0 = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], E1 = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let h = 0; h < nx - 1; h++) {
    const base = h + j * sy + k * sz, neg = val[base] < 0;
    let mixed = false;
    for (let c = 0; c < 8; c++) { cv[c] = val[base + off[c]]; if ((cv[c] < 0) !== neg) mixed = true; }
    if (!mixed) continue;
    let px = 0, py = 0, pz = 0, m = 0;
    for (let q = 0; q < 12; q++) {
      const e0 = E0[q], e1 = E1[q], v0 = cv[e0], v1 = cv[e1];
      if ((v0 < 0) === (v1 < 0)) continue;
      const t = v0 / (v0 - v1);
      px += (e0 & 1) + ((e1 & 1) - (e0 & 1)) * t; py += (e0 >> 1 & 1) + ((e1 >> 1 & 1) - (e0 >> 1 & 1)) * t; pz += (e0 >> 2) + ((e1 >> 2) - (e0 >> 2)) * t; m++;
    }
    vid[base] = pos.length / 3;
    pos.push(o[0] + (h + px / m) * cell, o[1] + (j + py / m) * cell, o[2] + (k + pz / m) * cell);
  }

  // nudge each vertex onto the surface along the gradient, and take that gradient as the
  // normal. Four samples at the corners of a small tetrahedron give both the gradient and
  // (their mean) the distance.
  const P = new Float32Array(pos), N = new Float32Array(P.length), e = cell * 0.25;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d, gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    const step = Math.max(-cell * 0.5, Math.min(cell * 0.5, (a + b + c + d) / 4));   // never further than half a cell
    N[i] = gx / gl; N[i + 1] = gy / gl; N[i + 2] = gz / gl;
    P[i] = x - step * N[i]; P[i + 1] = y - step * N[i + 1]; P[i + 2] = z - step * N[i + 2];
  }

  // a quad for every grid edge the surface crosses, between the four cells that share it
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let h = 1; h < nx - 1; h++) {
    const i = h + j * sy + k * sz, s = val[i] < 0;
    if (h < nx - 1 && (val[i + sx] < 0) !== s) quad(vid[i], vid[i - sy], vid[i - sy - sz], vid[i - sz], s);
    if (j < ny - 1 && (val[i + sy] < 0) !== s) quad(vid[i], vid[i - sz], vid[i - sx - sz], vid[i - sx], s);
    if (k < nz - 1 && (val[i + sz] < 0) !== s) quad(vid[i], vid[i - sx], vid[i - sx - sy], vid[i - sy], s);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(P, 3));
  g.setAttribute('normal', new BufferAttribute(N, 3));
  g.setIndex(idx);
  return g;
}
