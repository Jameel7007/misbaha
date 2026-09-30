// Synthesised sounds: a short filtered click for bead on bead, a gentle bell at 33 and 66,
// a fuller chime at 100.
let ctx = null, enabled = true, voice = 2700;

// create or resume the AudioContext; must first run inside a user gesture
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) { return null; }
}
export const setSoundEnabled = on => { enabled = on; };
// centre frequency of the click, set per bead material
export const setVoice = hz => { voice = hz; };

export function clack(vol = 1, delay = 0) {
  if (!enabled) return;
  const ac = unlockAudio(); if (!ac) return;
  const sr = ac.sampleRate, len = Math.floor(sr * 0.05), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0035));
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = voice * (0.9 + Math.random() * 0.2); bp.Q.value = 5;
  const g = ac.createGain(); g.gain.value = 0.9 * vol;
  src.connect(bp); bp.connect(g); g.connect(ac.destination);
  src.start(ac.currentTime + delay);
}

export function chime() {
  if (!enabled) return;
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime;
  for (const [f, a] of [[392, 0.12], [587.3, 0.08], [784, 0.04]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 2.5);
  }
}

// a gentle bell at the end of each thirty-three: two soft partials, a long decay
export function bell() {
  if (!enabled) return;
  const ac = unlockAudio(); if (!ac) return;
  const t = ac.currentTime + 0.04;
  for (const [f, a] of [[523.25, 0.07], [1046.5, 0.025]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.9);
  }
}
