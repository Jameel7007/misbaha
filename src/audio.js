// Sound. The bead click is the one from the original page: a 50 ms burst of noise, decaying
// in about 3.5 ms, through a band-pass filter at 2.7 kHz (±10% each time). Fresh noise every
// click, so no two are identical. All three materials and the separators use it.
//
// The bells at 33 and 100 are struck bowls: partials at the uneven ratios of a real bowl.
//
// The ambience is the ney, the reed flute of Sufi music: phrases from four recordings
// (src/ney/, credits in src/ney/SOURCES.md), one at a time in random order with a few
// seconds of quiet between, in a long dark reverb, over a very faint room tone. The
// recordings load only when the ambience is first turned on.
//
// An engine works on any audio context, so the same code renders offline for testing.

import { PHRASES } from './ney/phrases.js';
import neyIstanbul from './ney/115398-ney-istanbul.mp3';
import arabFlute from './ney/402709-arab-flute.mp3';
import ney from './ney/440816-ney.mp3';
import neyAnkara from './ney/580759-ney-ankara.mp3';

const CLICK_HZ = 2700;
const NEY_FILES = { '115398-ney-istanbul.mp3': neyIstanbul, '402709-arab-flute.mp3': arabFlute, '440816-ney.mp3': ney, '580759-ney-ankara.mp3': neyAnkara };
const NEY_LEVEL = 0.18, PAUSE = [3, 9];   // ney loudness under the clicks; seconds of quiet between phrases
// a seeded random, so the banks are the same on every load
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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

// a small room: a short, dark, decaying stereo tail
function renderRoom(ac) {
  const sr = ac.sampleRate, len = Math.floor(sr * 0.45), buf = ac.createBuffer(2, len, sr), R = rand(11);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; lp += 0.25 * ((R() * 2 - 1) - lp); d[i] = lp * Math.exp(-t / 0.09) * (1 - Math.exp(-t / 0.003)); }
  }
  return buf;
}

// a hall for the ney: a long (about 3 s), dark, slowly decaying stereo tail
function renderHall(ac) {
  const sr = ac.sampleRate, len = Math.floor(sr * 3.2), buf = ac.createBuffer(2, len, sr), R = rand(31);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; lp += (0.12 - 0.08 * Math.min(1, t / 2)) * ((R() * 2 - 1) - lp); d[i] = lp * Math.exp(-t / 0.7) * (1 - Math.exp(-t / 0.02)); }
  }
  return buf;
}

// the ney recordings, fetched and decoded once
let neyLoading = null;
function loadNey(ac) {
  return neyLoading ??= Promise.all(Object.entries(NEY_FILES).map(async ([name, url]) => [name, await ac.decodeAudioData(await (await fetch(url)).arrayBuffer())]))
    .then(Object.fromEntries);
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
  // bus: dry (clicks) and a little room (bells) → a gentle compressor so nothing clips
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  comp.connect(ac.destination);
  const dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(comp);
  const room = ac.createConvolver(); room.buffer = renderRoom(ac);
  const wet = ac.createGain(); wet.gain.value = 0.16; room.connect(wet); wet.connect(comp);
  const input = ac.createGain(); input.connect(dry); input.connect(room);
  const R = Math.random, R7 = rand(7);
  const bellBuf = renderBell(ac, 523.25, 3, R7), chimeBuf = renderBell(ac, 392, 4.5, R7);

  function play(buf, gain, rate, when, out) {
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(out); src.start(when);
  }
  return {
    // strength 0–1; soft: a landing on the rug, a little quieter
    click(strength = 1, { delay = 0, soft = false } = {}) {
      const sr = ac.sampleRate, len = Math.floor(sr * 0.05), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.exp(-i / (sr * 0.0035));
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = CLICK_HZ * (0.9 + R() * 0.2); bp.Q.value = 5;
      const g = ac.createGain(); g.gain.value = 0.9 * strength * (soft ? 0.7 : 1);
      src.connect(bp); bp.connect(g); g.connect(dry);
      src.start(ac.currentTime + delay);
    },
    // a gentle bell at the end of each thirty-three
    bell() { play(bellBuf, 0.09, 1, ac.currentTime + 0.04, input); },
    // the fuller chime at the hundredth
    chime() { play(chimeBuf, 0.16, 1, ac.currentTime, input); },
    ambience: (() => {
      let on = false, node = null, timer = 0, next = 0, sources = [];
      const recent = [];
      const bus = ac.createGain(); bus.gain.value = 0; bus.connect(comp);
      const hall = ac.createConvolver(); hall.buffer = renderHall(ac);
      const hallWet = ac.createGain(); hallWet.gain.value = 0.55; hall.connect(hallWet); hallWet.connect(bus);
      const neyDry = ac.createGain(); neyDry.gain.value = 0.7; neyDry.connect(bus);
      // schedule phrases up to `until` (seconds on the audio clock)
      function plan(neyBufs, until) {
        while (next < until) {
          let k; do k = Math.floor(R() * PHRASES.length); while (recent.includes(k));
          recent.push(k); if (recent.length > 4) recent.shift();
          const p = PHRASES[k], dur = p.end - p.start, buf = neyBufs[p.file];
          const src = ac.createBufferSource(); src.buffer = buf;
          const g = ac.createGain(), pan = ac.createStereoPanner(); pan.pan.value = (R() - 0.5) * 0.5;
          g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(p.gain * NEY_LEVEL, next + 0.08);
          g.gain.setValueAtTime(p.gain * NEY_LEVEL, next + dur - 0.5); g.gain.linearRampToValueAtTime(0, next + dur);
          src.connect(g); g.connect(pan); pan.connect(neyDry); pan.connect(hall);
          src.start(next, p.start, dur);
          sources.push(src); src.onended = () => { sources = sources.filter(x => x !== src); };
          stats.phrases++;
          next += dur + PAUSE[0] + R() * (PAUSE[1] - PAUSE[0]);
        }
      }
      const fn = (want, { until } = {}) => {
        if (want && !on) {
          on = true;
          bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setValueAtTime(bus.gain.value, ac.currentTime); bus.gain.linearRampToValueAtTime(1, ac.currentTime + 2);
          node = ac.createBufferSource(); node.buffer = renderRoomTone(ac); node.loop = true;
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
          const g = ac.createGain(); g.gain.value = 0.012;
          node.connect(lp); lp.connect(g); g.connect(bus); node.start();
          return loadNey(ac).then(bufs => {
            if (!on) return;
            next = Math.max(next, ac.currentTime + 1.5);
            if (until) plan(bufs, until);   // offline: everything at once
            else { plan(bufs, ac.currentTime + 30); timer = setInterval(() => plan(bufs, ac.currentTime + 30), 5000); }
          });
        }
        if (!want && on) {
          on = false; clearInterval(timer);
          const t = ac.currentTime, n = node, srcs = sources;
          bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.2);
          setTimeout(() => { n.stop(); srcs.forEach(x => { try { x.stop(); } catch (e) {} }); }, 1400);
          node = null; sources = []; next = 0;
        }
      };
      return fn;
    })(),
  };
}

// ── the live engine ──
let ctx = null, engine = null, enabled = true, ambienceOn = false;
export const stats = { clicks: 0, landings: 0, phrases: 0 };   // what has played (read by tests)

// create or resume the AudioContext; must first run inside a user gesture
export function unlockAudio() {
  try {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); engine = createEngine(ctx); if (ambienceOn && enabled) engine.ambience(true); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) { return null; }
}
export const setSoundEnabled = on => { enabled = on; if (engine) engine.ambience(on && ambienceOn); };
export function setAmbience(on) { ambienceOn = on; if (on) unlockAudio(); if (engine) engine.ambience(on && enabled); }

// options: delay, soft (landing on the rug)
export function click(strength = 1, opts = {}) {
  if (!enabled || !unlockAudio()) return;
  engine.click(strength, opts);
  if (opts.soft) stats.landings++; else stats.clicks++;
}
export function bell() { if (enabled && unlockAudio()) engine.bell(); }
export function chime() { if (enabled && unlockAudio()) engine.chime(); }
