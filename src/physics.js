// Position-based dynamics for the strand.
// This module owns every simulation array. strand.js only reads X; the controller in
// main.js steers the strand through `sim` and the pin/grab helpers at the bottom, so
// inverse masses are only ever changed in one place.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Mulberry32. Its state moves by a fixed constant on every call, so `skip` jumps ahead
// in O(1). The baseline drew all its randomness from one rng(99) stream in a fixed
// order (cloud texture, fringe texture, rug texture, then the beads); each module now
// takes its own slice of that stream, so the strand looks identical without the
// modules depending on load order.
export function rng(seed, skip = 0) {
  let s = (seed + Math.imul(skip, 0x6D2B79F5)) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const RNG_SEED = 99;
export const RNG_SKIP = { cloud: 0, fringe: 320, rug: 448, strand: 262592 };

// ── the finger the strand hangs over ──
// A capsule along z: radius PEG_R, FINGER_LEN long, its rounded tip at sim.pegEnd. It sits at
// PEG_FRONT while counting and slides back to PEG_BACK (out of the loop) in Hold mode.
export const PEG = { x: 0, y: 6.2 }, PEG_R = 0.075, PEG_FRONT = 0.34, PEG_BACK = PEG_FRONT - 1.0;
export const FINGER_LEN = 0.9;
export const WALL_Z = -3.2;   // the tiled wall behind the strand

// ── the strand: 0 imam, 1–33, separator, 35–67, separator, 69–101, then the tassel cord ──
export const NL = 102, NT = 5, N = NL + NT, SEP = [34, 68];
export const X = new Float32Array(3 * N);
const P0 = new Float32Array(3 * N), V = new Float32Array(3 * N);
const W = new Float32Array(N), INV = new Float32Array(N), HL = new Float32Array(N);
export const RAD = new Float32Array(N);
// KIND: 0 bead, 1 separator, 2 imam, 3 tassel cord
export const KIND = new Uint8Array(N), SIZE = new Float32Array(N), SPIN = new Float32Array(N), TONE = new Float32Array(N);
const BR = 0.05;
{
  const R = rng(RNG_SEED, RNG_SKIP.strand);
  for (let i = 0; i < N; i++) {
    const kind = i === 0 ? 2 : i < NL ? (SEP.includes(i) ? 1 : 0) : 3;
    KIND[i] = kind;
    if (kind === 0) { SIZE[i] = BR * (0.95 + R() * 0.1); RAD[i] = SIZE[i]; HL[i] = SIZE[i] * 0.86; INV[i] = 1; }
    else if (kind === 1) { RAD[i] = 0.04; HL[i] = 0.024; INV[i] = 1.4; }
    else if (kind === 2) { RAD[i] = 0.055; HL[i] = 0.11; INV[i] = 0.5; }
    else { RAD[i] = 0.022; HL[i] = 0.025; INV[i] = 2.2; }
    SPIN[i] = R() * Math.PI * 2; TONE[i] = R();
    W[i] = INV[i];
  }
}
// strand index -> bead number 0..99 (separators report the bead before them)
export const beadNo = i => i <= 0 ? 0 : i <= 34 ? Math.min(i, 33) : i <= 68 ? Math.min(i - 1, 66) : i - 2;

// thread: distance constraints between neighbours around the loop, then the tassel cord
const con = [];
for (let i = 0; i < NL; i++) { const j = (i + 1) % NL; con.push([i, j, HL[i] + HL[j] + 0.003]); }
con.push([0, NL, HL[0] + 0.03]);
for (let k = 0; k < NT - 1; k++) con.push([NL + k, NL + k + 1, 0.05]);
export const CA = new Int32Array(con.map(c => c[0])), CB = new Int32Array(con.map(c => c[1]));
const CL = new Float32Array(con.map(c => c[2]));
// every pair not joined by thread collides as spheres
const linked = new Set(con.map(c => Math.min(c[0], c[1]) * N + Math.max(c[0], c[1])));
const pairList = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (!linked.has(i * N + j)) pairList.push(i, j);
const PAIRS = new Int32Array(pairList);

// ── inputs the controller steers ──
// pin: the loop body sitting on the peg; held: whether it is pinned there.
// grab: body dragged by the pointer in Hold mode. *From/*To are interpolated across substeps.
// bias: sideways push used while re-hanging so the loop falls to both sides of the peg.
export const sim = {
  pin: 0, held: true, pinFrom: [0, 0, 0], pinTo: [0, 0, 0],
  grab: -1, grabFrom: [0, 0, 0], grabTo: [0, 0, 0],
  bias: 0, pegEnd: PEG_FRONT, pegGoal: PEG_FRONT,
  drag: 0,   // extra velocity damping per second (main.js sets it per mode)
};

// ── physics: fixed 60 Hz step, 12 substeps ──
const G = 55, SUB = 12, FRIC = 0.3, DAMP = 0.9993;
const FINGER_FRIC = 0.3;   // beads touching the finger lose this share of their motion each substep, as on the rug
// rest damping: below REST units/s a velocity component loses extra speed each substep,
// so the strand comes to a true stop instead of creeping for tens of seconds (a creeping
// strand makes the bead highlights hop between pixels, which reads as shimmer)
const REST = 0.004, REST_DAMP = 0.995;

export function step(dt) {
  const h = dt / SUB;
  const { pin, held, grab, bias, pegEnd, pinFrom, pinTo, grabFrom, grabTo } = sim;
  const damp = DAMP * Math.exp(-sim.drag * h);
  const tipZ = pegEnd - PEG_R, baseZ = pegEnd - FINGER_LEN;   // the capsule's axis runs baseZ → tipZ
  for (let s = 0; s < SUB; s++) {
    const a = (s + 1) / SUB;
    for (let i = 0; i < N; i++) {
      const k = 3 * i;
      P0[k] = X[k]; P0[k + 1] = X[k + 1]; P0[k + 2] = X[k + 2];
      if (W[i] === 0) continue;
      V[k + 1] -= G * h;
      if (bias && i < NL && X[k + 1] < PEG.y + 0.05) {
        const o = (i - pin + NL) % NL;
        if (o) V[k] += (o < NL / 2 ? 1 : -1) * bias * h;
      }
      X[k] += V[k] * h; X[k + 1] += V[k + 1] * h; X[k + 2] += V[k + 2] * h;
    }
    if (held) { const k = 3 * pin; for (let c = 0; c < 3; c++) X[k + c] = pinFrom[c] + (pinTo[c] - pinFrom[c]) * a; }
    if (grab >= 0) { const k = 3 * grab; for (let c = 0; c < 3; c++) X[k + c] = grabFrom[c] + (grabTo[c] - grabFrom[c]) * a; }

    for (let it = 0; it < 2; it++) {
      for (let c = 0; c < CA.length; c++) {
        const i = CA[c], j = CB[c], wi = W[i], wj = W[j], ws = wi + wj;
        if (ws === 0) continue;
        const ki = 3 * i, kj = 3 * j;
        const dx = X[kj] - X[ki], dy = X[kj + 1] - X[ki + 1], dz = X[kj + 2] - X[ki + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const f = (d - CL[c]) / (d * ws);
        X[ki] += dx * f * wi; X[ki + 1] += dy * f * wi; X[ki + 2] += dz * f * wi;
        X[kj] -= dx * f * wj; X[kj + 1] -= dy * f * wj; X[kj + 2] -= dz * f * wj;
      }
    }
    for (let p = 0; p < PAIRS.length; p += 2) {
      const i = PAIRS[p], j = PAIRS[p + 1];
      const ki = 3 * i, kj = 3 * j;
      const dx = X[kj] - X[ki], dy = X[kj + 1] - X[ki + 1], dz = X[kj + 2] - X[ki + 2];
      const m = RAD[i] + RAD[j], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= m * m || d2 < 1e-12) continue;
      const wi = W[i], wj = W[j], ws = wi + wj;
      if (ws === 0) continue;
      const d = Math.sqrt(d2), f = (d - m) / (d * ws);
      X[ki] += dx * f * wi; X[ki + 1] += dy * f * wi; X[ki + 2] += dz * f * wi;
      X[kj] -= dx * f * wj; X[kj + 1] -= dy * f * wj; X[kj + 2] -= dz * f * wj;
    }
    for (let i = 0; i < N; i++) {
      if (W[i] === 0) continue;
      const k = 3 * i, r = RAD[i];
      // the finger: push out of the capsule (closest point on its axis segment)
      const z = X[k + 2];
      if (z > baseZ && z < pegEnd + r) {
        const cz = Math.min(z, tipZ), dx = X[k] - PEG.x, dy = X[k + 1] - PEG.y, dz = z - cz;
        const d = Math.hypot(dx, dy, dz), m = PEG_R + r;
        if (d < m) {
          if (d < 1e-6) X[k + 1] = PEG.y + m;
          else { X[k] = PEG.x + dx / d * m; X[k + 1] = PEG.y + dy / d * m; X[k + 2] = cz + dz / d * m; }
          // friction: a bead on the finger doesn't slide freely
          X[k] -= (X[k] - P0[k]) * FINGER_FRIC; X[k + 1] -= (X[k + 1] - P0[k + 1]) * FINGER_FRIC; X[k + 2] -= (X[k + 2] - P0[k + 2]) * FINGER_FRIC;
        }
      }
      if (X[k + 1] < r) {
        X[k + 1] = r;
        X[k] -= (X[k] - P0[k]) * FRIC; X[k + 2] -= (X[k + 2] - P0[k + 2]) * FRIC;
      }
      X[k] = clamp(X[k], -12, 12); X[k + 2] = clamp(X[k + 2], -12, 12);
    }
    const inv = 1 / h;
    for (let i = 0; i < 3 * N; i++) {
      const v = (X[i] - P0[i]) * inv * damp;
      V[i] = v > -REST && v < REST ? v * REST_DAMP : v;
    }
  }
  sim.pinFrom = pinTo.slice();
  sim.grabFrom = grabTo.slice();
}

export function settle(n) { for (let i = 0; i < n; i++) step(1 / 60); }

export const bodyPos = i => [X[3 * i], X[3 * i + 1], X[3 * i + 2]];
export const pinTop = i => [PEG.x, PEG.y + PEG_R + RAD[i] + 0.001, 0];

// lay the loop out as a tall thin ellipse hanging from the peg (then settle() it)
export function layoutHang() {
  const { pin } = sim, top = pinTop(pin);
  let L = 0; for (let c = 0; c < NL; c++) L += CL[c];
  const b = L / 4.15, a = 0.15, cy = top[1] - b;
  for (let j = 0; j < NL; j++) {
    const i = (pin + j) % NL, th = Math.PI / 2 - 2 * Math.PI * j / NL;
    X[3 * i] = a * Math.cos(th); X[3 * i + 1] = j === 0 ? top[1] : cy + b * Math.sin(th); X[3 * i + 2] = 0;
  }
  for (let k = 0; k < NT; k++) { const i = NL + k; X[3 * i] = X[0]; X[3 * i + 1] = X[1] - 0.14 - k * 0.05; X[3 * i + 2] = 0.02; }
  V.fill(0);
  sim.held = true; W.set(INV); W[pin] = 0;
  sim.pinFrom = top.slice(); sim.pinTo = top.slice();
  sim.pegEnd = sim.pegGoal = PEG_FRONT;
}

// ── pin and grab: the only places inverse mass changes after layout ──
// move the pin to loop body `next`, releasing the old one
export function passPin(next) {
  W[sim.pin] = INV[sim.pin];
  sim.pin = next; W[next] = 0;
  sim.pinFrom = bodyPos(next); sim.pinTo = sim.pinFrom.slice();
}
// pin the current body where it is (the controller then steers pinTo)
export function holdPin() {
  sim.held = true; W[sim.pin] = 0;
  sim.pinFrom = bodyPos(sim.pin); sim.pinTo = sim.pinFrom.slice();
}
export function dropPin() { sim.held = false; W[sim.pin] = INV[sim.pin]; }
export function grabBody(i) {
  sim.grab = i; W[i] = 0;
  sim.grabFrom = bodyPos(i); sim.grabTo = sim.grabFrom.slice();
}
export function moveGrab(x, y, z) {
  sim.grabTo = [clamp(x, -6, 6), Math.max(RAD[sim.grab], Math.min(y, 8)), clamp(z, -6, 6)];
}
export function releaseGrab() {
  const g = sim.grab;
  if (g < 0) return;
  if (!(sim.held && g === sim.pin)) W[g] = INV[g];
  sim.grab = -1;
}

// nearest body whose (generously padded) sphere the ray passes through, or -1
export function nearestBody(o, d) {
  let best = -1, bt = Infinity;
  for (let i = 0; i < N; i++) {
    const px = X[3 * i] - o.x, py = X[3 * i + 1] - o.y, pz = X[3 * i + 2] - o.z;
    const t = px * d.x + py * d.y + pz * d.z;
    if (t < 0) continue;
    const cx = px - d.x * t, cy = py - d.y * t, cz = pz - d.z * t;
    const rr = RAD[i] * 1.9 + 0.02;
    if (cx * cx + cy * cy + cz * cz < rr * rr && t < bt) { bt = t; best = i; }
  }
  return best;
}
