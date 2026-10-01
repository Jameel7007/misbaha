// Finding and measuring individual bead clicks in a recording (used by build-clicks.mjs).
import { execFileSync } from 'child_process';

export let SR = 44100;
export const setRate = r => { SR = r; };

// decode any audio file to mono float32 at SR with ffmpeg
export function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

const db = x => 20 * Math.log10(Math.max(1e-9, x));

// onsets: where the short-term peak envelope jumps well above the level just before it
export function findClicks(x, { minGap = 0.06, rise = 12, floorDb = -50 } = {}) {
  const hop = Math.round(SR * 0.001), n = Math.floor(x.length / hop), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * hop; j < (i + 1) * hop; j++) m = Math.max(m, Math.abs(x[j])); env[i] = m; }
  const out = [];
  let last = -1e9;
  for (let i = 10; i < n - 1; i++) {
    let before = 0; for (let j = i - 10; j < i - 2; j++) before = Math.max(before, env[j]);
    if (db(env[i]) > floorDb && db(env[i]) - db(before) > rise && env[i] >= env[i + 1] * 0.7 && i - last > minGap * 1000) { out.push(i * hop); last = i; }
  }
  return out;
}

// a click and its measurements: where it starts, its peak, how long until it fades 40 dB,
// how loud the 30 ms before it was (isolation), whether another click follows within 50 ms,
// and its brightness (spectral centroid, by a simple DFT over the first 20 ms)
export function measure(x, at, nextAt) {
  const s = Math.max(0, at - Math.round(SR * 0.003));
  let peak = 0, pk = s; for (let i = s; i < Math.min(x.length, s + SR * 0.01); i++) if (Math.abs(x[i]) > peak) { peak = Math.abs(x[i]); pk = i; }
  let end = pk; const quiet = peak * 0.01;
  for (let i = pk, run = 0; i < Math.min(x.length, pk + SR * 0.25); i++) { if (Math.abs(x[i]) < quiet) { if (++run > SR * 0.008) { end = i; break; } } else { run = 0; end = i; } }
  let pre = 0; for (let i = Math.max(0, s - SR * 0.03); i < s; i++) pre = Math.max(pre, Math.abs(x[i]));
  const N = 512, w = x.subarray(pk, pk + N); let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { let re = 0, im = 0; for (let t = 0; t < w.length; t++) { const a = 2 * Math.PI * k * t / N, h = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / N); re += w[t] * h * Math.cos(a); im -= w[t] * h * Math.sin(a); } const mag = Math.hypot(re, im); num += mag * k * SR / N; den += mag; }
  return { start: s, peak, peakDb: +db(peak).toFixed(1), length: +((end - s) / SR).toFixed(3), isolationDb: +(db(peak) - db(pre)).toFixed(1), crowded: nextAt !== undefined && nextAt - at < SR * 0.05, centroid: Math.round(num / den) };
}
