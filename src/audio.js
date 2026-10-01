// Sound. Bead clicks are real recordings: single clicks cut from Freesound recordings of a
// rosary, a wooden bracelet and two abacuses (scripts/build-clicks.mjs; credits in
// audio-src/SOURCES.md), about ten per material. Amber plays the rosary, olive the wooden
// bracelet, ebony the hard abacus. The clicks arrive as raw samples in clicks.data.js, which
// loads separately so it never delays the first frame.
//
// Against machine-gun repetition: none of the last two recordings again; a fixed pitch per
// bead (from its size) plus a small random spread; varied loudness and a few milliseconds of
// timing play; fast counting plays lighter; a short room reverb puts the clicks in a space.
//
// The brass separators are the one sound still synthesised: a real click for the contact,
// with a short metal ring made of a few decaying modes. The bells are synthesised too, with
// the uneven partials of a struck bowl rather than pure tones.
//
// An engine works on any audio context, so the same code renders offline for testing.

// the brass ring: [frequency Hz, decay s, amplitude] per mode
const BRASS = [[2950, 0.09, 1], [4870, 0.06, 0.5], [7300, 0.035, 0.3], [1610, 0.05, 0.25]];
// a seeded random, so the banks are the same on every load
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the brass ring after the contact: modes only, no contact noise
function renderRing(ac, R) {
  const sr = ac.sampleRate, len = Math.floor(sr * 0.3), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const modes = BRASS.map(([f, tau, a]) => [f * (1 + (R() - 0.5) * 0.04), tau * (0.85 + R() * 0.3), a, R() * Math.PI * 2]);
  for (let i = 0; i < len; i++) {
    const t = i / sr; let v = 0;
    for (const [f, tau, a, ph] of modes) v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + ph);
    d[i] = v * (1 - Math.exp(-t / 0.0004));
  }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] *= 0.8 / peak;
  return buf;
}

// a struck bowl: partials at the uneven ratios of a real bowl, each a close pair that beats
// slowly, the higher ones dying sooner; a soft mallet, so the attack takes a few milliseconds
function renderBell(ac, f0, len, R) {
  const sr = ac.sampleRate, n = Math.floor(sr * len), buf = ac.createBuffer(2, n, sr);
  const partials = [[1, 1, 1], [2.71, 0.45, 0.55], [5.08, 0.22, 0.3], [8.2, 0.1, 0.16]];   // ratio, amplitude, decay share
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (const [r, a, k] of partials) for (const beat of [-1, 1]) {
      const f = f0 * r * (1 + beat * 0.0012 + (R() - 0.5) * 0.0004), ph = R() * Math.PI * 2, tau = len * 0.32 * k;
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] += 0.5 * a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + ph); }
    }
    for (let i = 0; i < n; i++) d[i] *= (1 - Math.exp(-i / sr / 0.004)) * Math.min(1, (n - i) / (sr * 0.05));
  }
  let peak = 0; for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] /= peak; }
  return buf;
}

// the recorded clicks: 16-bit samples (base64) into audio buffers at their own rate
function makeBanks(ac, data) {
  const banks = {};
  for (const [k, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    banks[k] = list.map(b64 => {
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), pcm = new Int16Array(bytes.buffer);
      const buf = ac.createBuffer(1, pcm.length, data.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) d[i] = pcm[i] / 32768;
      return buf;
    });
  }
  return banks;
}

// a small room: a short, dark, decaying stereo tail
function renderRoom(ac) {
  const sr = ac.sampleRate, len = Math.floor(sr * 0.45), buf = ac.createBuffer(2, len, sr), R = rand(11);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; lp += 0.25 * ((R() * 2 - 1) - lp); d[i] = lp * Math.exp(-t / 0.09) * (1 - Math.exp(-t / 0.003)); }
  }
  return buf;
}

// quiet room tone: low, slow noise, looped seamlessly by crossfading its ends
function renderRoomTone(ac) {
  const sr = ac.sampleRate, len = sr * 6, fade = sr, buf = ac.createBuffer(2, len, sr), R = rand(23);
  for (let c = 0; c < 2; c++) {
    const raw = new Float32Array(len + fade); let b = 0;
    for (let i = 0; i < raw.length; i++) { b = (b + 0.02 * (R() * 2 - 1)) / 1.02; raw[i] = b * 3.5; }   // brown noise
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
  }
  return buf;
}

// clicks: the CLICKS object from clicks.data.js
export function createEngine(ac, clicks) {
  // bus: dry + a little room → a gentle compressor so overlapping clicks never clip
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  comp.connect(ac.destination);
  const dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(comp);
  const room = ac.createConvolver(); room.buffer = renderRoom(ac);
  const wet = ac.createGain(); wet.gain.value = 0.16; room.connect(wet); wet.connect(comp);
  const input = ac.createGain(); input.connect(dry); input.connect(room);
  // the rug muffles a landing
  const rug = ac.createBiquadFilter(); rug.type = 'lowpass'; rug.frequency.value = 3000; rug.Q.value = 0.5;
  const rugGain = ac.createGain(); rugGain.gain.value = 1.7; rug.connect(rugGain); rugGain.connect(input);

  const banks = makeBanks(ac, clicks), R = Math.random, R7 = rand(7);
  const rings = Array.from({ length: 4 }, () => renderRing(ac, R7));
  const bellBuf = renderBell(ac, 523.25, 3, R7), chimeBuf = renderBell(ac, 392, 4.5, R7);
  const last = {}, recent = [];

  function play(buf, gain, rate, when, out) {
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(out); src.start(when);
  }
  // a recording other than the last two played from this bank
  function pick(bank) {
    const list = banks[bank], prev = last[bank] || (last[bank] = []);
    let v; do v = Math.floor(R() * list.length); while (prev.includes(v));
    prev.push(v); if (prev.length > 2) prev.shift();
    return list[v];
  }

  return {
    // strength 0–1; pitch: playback rate (1 = as rendered); model: material; soft: on the rug
    click(strength = 1, { model = 'amber', pitch = 1, delay = 0, soft = false } = {}) {
      const when = ac.currentTime + delay + R() * 0.004;
      // hurried counting plays lighter: beyond about 8 clicks in the last half second
      while (recent.length && when - recent[0] > 0.5) recent.shift();
      recent.push(when);
      const hurry = Math.max(0, Math.min(1, (recent.length - 8) / 12));
      const gain = strength * (0.8 + R() * 0.2) * (1 - 0.35 * hurry) * (soft ? 0.85 : 1), out = soft ? rug : input;
      if (model === 'brass') {
        // brass: the contact of a hard click, then the ring
        play(pick('ebony'), gain * 0.7, 1.15 * (1 + (R() - 0.5) * 0.04), when, out);
        play(rings[Math.floor(R() * rings.length)], gain * 0.3, pitch * (1 + (R() - 0.5) * 0.02), when, out);
        return;
      }
      play(pick(model), gain, pitch * (1 + (R() - 0.5) * 0.04), when, out);
    },
    // a gentle bell at the end of each thirty-three
    bell() { play(bellBuf, 0.09, 1, ac.currentTime + 0.04, input); },
    // the fuller chime at the hundredth
    chime() { play(chimeBuf, 0.16, 1, ac.currentTime, input); },
    roomTone: (() => {
      let node = null, gain = null;
      return on => {
        if (on && !node) {
          node = ac.createBufferSource(); node.buffer = renderRoomTone(ac); node.loop = true;
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
          gain = ac.createGain(); gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(0.02, ac.currentTime + 2);
          node.connect(lp); lp.connect(gain); gain.connect(comp); node.start();
        } else if (!on && node) {
          const n = node; gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setTargetAtTime(0, ac.currentTime, 0.3);
          setTimeout(() => n.stop(), 1500); node = null;
        }
      };
    })(),
  };
}

// ── the live engine ──
let ctx = null, engine = null, enabled = true, material = 'amber', roomOn = false;
export const stats = { clicks: 0, landings: 0 };   // what has played (read by tests)
// the recordings load on their own, alongside the scene; sound starts once both are here
let clicks = null;
export const soundReady = import('./clicks.data.js').then(m => { clicks = m.CLICKS; start(); });
function start() {
  if (!ctx || engine || !clicks) return;
  engine = createEngine(ctx, clicks);
  if (roomOn && enabled) engine.roomTone(true);
}

// create or resume the AudioContext; must first run inside a user gesture
export function unlockAudio() {
  try {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); start(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) { return null; }
}
export const setSoundEnabled = on => { enabled = on; if (engine) engine.roomTone(on && roomOn); };
export const setMaterial = key => { material = key; };
export function setRoomTone(on) { roomOn = on; if (engine) engine.roomTone(on && enabled); }

// options: pitch (per bead), delay, soft (landing on the rug), model (defaults to the material)
export function click(strength = 1, opts = {}) {
  if (!enabled || !unlockAudio() || !engine) return;
  engine.click(strength, { model: material, ...opts });
  if (opts.soft) stats.landings++; else stats.clicks++;
}
export function bell() { if (enabled && unlockAudio() && engine) engine.bell(); }
export function chime() { if (enabled && unlockAudio() && engine) engine.chime(); }
