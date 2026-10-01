// Sound. Bead clicks are built by modal synthesis: an impact excites a few resonant modes of
// the bead, each a sine that rings and decays at its own rate, plus a very short contact
// noise. Each material has its own modes (amber: a hard, bright tick; olive: a duller knock;
// ebony: a dense clack; the brass separators ring longer). A bank of slightly different
// variants per material is rendered once, so playback costs nothing.
//
// Against machine-gun repetition: never the same variant twice in a row; a fixed pitch per
// bead (from its size) plus a small random spread; varied loudness and a few milliseconds of
// timing play; some variants carry a second, softer tick (the bead knocking its neighbour);
// fast counting plays lighter; a short room reverb puts the clicks in a space.
//
// No recordings were available, so these are synthesised. Real recordings of a misbaha
// could replace a material's bank later (see makeBank).
//
// An engine works on any audio context, so the same code renders offline for testing.

const MODELS = {
  // [frequency Hz, decay s, amplitude] per mode; noise: share of contact noise
  amber: { modes: [[3150, 0.012, 1], [5200, 0.007, 0.55], [7900, 0.004, 0.3], [1850, 0.018, 0.22]], noise: 0.22 },
  olive: { modes: [[1450, 0.008, 1], [2650, 0.006, 0.5], [4100, 0.003, 0.25], [880, 0.012, 0.2]], noise: 0.35 },
  ebony: { modes: [[2250, 0.013, 1], [3750, 0.008, 0.6], [5900, 0.005, 0.32], [1300, 0.016, 0.2]], noise: 0.2 },
  brass: { modes: [[2950, 0.09, 1], [4870, 0.06, 0.5], [7300, 0.035, 0.3], [1610, 0.05, 0.25]], noise: 0.08 },
};
const VARIANTS = 8;

// a seeded random, so the banks are the same on every load
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// one click: a short contact pulse drives each mode; some variants add a second tick
function renderClick(ac, model, R) {
  const sr = ac.sampleRate, len = Math.floor(sr * 0.14), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const hits = [[0, 1]];
  if (R() < 0.45) hits.push([0.008 + R() * 0.018, 0.25 + R() * 0.35]);   // the neighbour knock
  const modes = model.modes.map(([f, tau, a]) => [f * (1 + (R() - 0.5) * 0.06), tau * (0.85 + R() * 0.3), a * (0.8 + R() * 0.4), R() * Math.PI * 2]);
  for (const [t0, amp] of hits) {
    const start = Math.floor(t0 * sr), contact = 0.00015 + R() * 0.0002;   // contact time: harder = shorter
    for (let i = start; i < len; i++) {
      const t = (i - start) / sr;
      let v = 0;
      for (const [f, tau, a, ph] of modes) v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + ph);
      v *= 1 - Math.exp(-t / contact);   // the attack takes as long as the contact
      v += model.noise * (R() * 2 - 1) * Math.exp(-t / 0.0012);
      d[i] += amp * v;
    }
  }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] *= 0.8 / peak;
  return buf;
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

export function createEngine(ac) {
  // bus: dry + a little room → a gentle compressor so overlapping clicks never clip
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  comp.connect(ac.destination);
  const dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(comp);
  const room = ac.createConvolver(); room.buffer = renderRoom(ac);
  const wet = ac.createGain(); wet.gain.value = 0.16; room.connect(wet); wet.connect(comp);
  const input = ac.createGain(); input.connect(dry); input.connect(room);
  // the rug muffles a landing
  const rug = ac.createBiquadFilter(); rug.type = 'lowpass'; rug.frequency.value = 1400; rug.Q.value = 0.5; rug.connect(input);

  const banks = {};
  for (const [k, m] of Object.entries(MODELS)) { const R = rand(k.length * 7919 + 1); banks[k] = Array.from({ length: VARIANTS }, () => renderClick(ac, m, R)); }
  const last = {}, recent = [];
  const R = Math.random;

  return {
    // strength 0–1; pitch: playback rate (1 = as rendered); model: material; soft: on the rug
    click(strength = 1, { model = 'amber', pitch = 1, delay = 0, soft = false } = {}) {
      const when = ac.currentTime + delay;
      // hurried counting plays lighter: beyond about 8 clicks in the last half second
      while (recent.length && when - recent[0] > 0.5) recent.shift();
      recent.push(when);
      const hurry = Math.max(0, Math.min(1, (recent.length - 8) / 12));
      // a variant other than the last one played for this material
      let v = Math.floor(R() * (VARIANTS - 1)); if (v >= (last[model] ?? -1)) v++;
      last[model] = v;
      const src = ac.createBufferSource(); src.buffer = banks[model][v];
      src.playbackRate.value = pitch * (1 + (R() - 0.5) * 0.04);
      const g = ac.createGain(); g.gain.value = strength * (0.8 + R() * 0.2) * (1 - 0.35 * hurry) * (soft ? 0.85 : 1);
      src.connect(g); g.connect(soft ? rug : input);
      src.start(when + R() * 0.004);
    },
    // a gentle bell at the end of each thirty-three
    bell() {
      const t = ac.currentTime + 0.04;
      for (const [f, a] of [[523.25, 0.07], [1046.5, 0.025]]) tone(f, a, t, 1.8);
    },
    // the fuller chime at the hundredth
    chime() {
      const t = ac.currentTime;
      for (const [f, a] of [[392, 0.12], [587.3, 0.08], [784, 0.04]]) tone(f, a, t, 2.4);
    },
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
  function tone(f, a, t, len) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(input); o.start(t); o.stop(t + len + 0.1);
  }
}

// ── the live engine ──
let ctx = null, engine = null, enabled = true, material = 'amber', roomOn = false;
export const stats = { clicks: 0, landings: 0 };   // what has played (read by tests)

// create or resume the AudioContext; must first run inside a user gesture
export function unlockAudio() {
  try {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); engine = createEngine(ctx); if (roomOn) engine.roomTone(true); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) { return null; }
}
export const setSoundEnabled = on => { enabled = on; if (engine) engine.roomTone(on && roomOn); };
export const setMaterial = key => { material = key; };
export function setRoomTone(on) { roomOn = on; if (engine) engine.roomTone(on && enabled); }

// options: pitch (per bead), delay, soft (landing on the rug), model (defaults to the material)
export function click(strength = 1, opts = {}) {
  if (!enabled || !unlockAudio()) return;
  engine.click(strength, { model: material, ...opts });
  if (opts.soft) stats.landings++; else stats.clicks++;
}
export function bell() { if (enabled && unlockAudio()) engine.bell(); }
export function chime() { if (enabled && unlockAudio()) engine.chime(); }
