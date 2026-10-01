// Boot, the counting / mode controller, and the frame loop.
import { bell, chime, click, setAmbience, setSoundEnabled, unlockAudio } from './audio.js';
import * as dhikr from './dhikr.js';
import { createDust } from './dust.js';
import { createHand } from './hand.js';
import { attachInput } from './input.js';
import {
  KIND, NL, PEG, PEG_BACK, PEG_FRONT, PEG_R, RAD, X, clamp, dropPin, holdPin, impacts,
  layoutHang, passPin, pinTop, releaseGrab, settle, sim, step,
} from './physics.js';
import { addRoom, createRig, createStage } from './scene.js';
import { VARIETIES, createStrand } from './strand.js';
import { makeTextures } from './textures.js';
import * as ui from './ui.js';

const store = {
  get(k) { try { return localStorage.getItem('misbaha.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('misbaha.' + k, v); } catch (e) {} },
};
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const yieldFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Fonts start loading at once; the title appears when they're ready.
const fonts = ui.loadFonts();
let stage;
try { stage = createStage(ui.canvas); } catch (e) { ui.showFallback(); }
if (stage) boot(stage);

// Boot runs in steps, yielding a frame between them so the loading bar can move:
// textures → room and strand → settle the physics → compile every shader → fonts.
async function boot(stage) {
  const { renderer, scene, camera } = stage;
  ui.intro.progress(0.08);
  await yieldFrame();
  const tex = makeTextures(renderer);
  ui.intro.progress(0.45);
  await yieldFrame();
  const room = addRoom(scene, tex, stage.dimEnv);
  // dev-only handle for tuning light levels live; stripped from production builds
  if (import.meta.env.DEV) window.__stage = { ...stage, ...room };
  const strand = createStrand(scene, tex);
  strand.materials.forEach(stage.gateToLamp);
  const hand = createHand(scene);
  stage.gateToLamp(hand.material);
  if (import.meta.env.DEV) window.__stage.hand = hand;
  const rig = createRig(camera);
  const dust = createDust(scene, stage.lamp, renderer);

  // ── counting state ──
  // adv: the bead currently travelling onto the peg; queued: taps made while it travels
  // rehang: the lift back onto the peg after Hold mode
  // started: the title screen has been dismissed (no counting before Begin)
  // resting: the hundredth moment is showing (no counting until the next round begins)
  let mode = 'count', adv = null, queued = 0, rehang = null, started = false, resting = false;

  // the peg's glow: each pass raises a target that decays; the light follows it smoothly,
  // so fast tapping gives a steady glow rather than a strobe
  const PEG_GLOW = 2.2;   // candela per pulse unit: a pass brightens the peg area ~20%, 33 and 66 ~40%
  let glowTarget = 0, glowLevel = 0;
  const pulse = strength => { glowTarget = Math.max(glowTarget, strength); };
  // ── the dhikr set: a count per set, saved on this device ──
  // Every bead or imām passed is one count. The strand is placed so the imām comes round on
  // each hundredth; the ring shows where the count stands on the strand.
  const saved = dhikr.load();
  let setKey = saved.current, { count, round } = dhikr.progressOf(saved, setKey);
  const currentSet = () => dhikr.preset(setKey, saved.custom);
  const strandIndex = c => c <= 33 ? c : c <= 66 ? c + 1 : c + 2;   // bead 1–99 → strand position
  const cycle = () => count === 0 ? 0 : ((count - 1) % 100) + 1;    // 1–100 along the strand
  const pinFor = () => cycle() === 100 ? 0 : strandIndex(cycle());
  const showCount = () => ui.showTally(dhikr.view(currentSet(), count), { at: pinFor(), loopDone: cycle() === 100 }, round);
  const persist = () => { saved.current = setKey; saved.progress[setKey] = { count, round }; dhikr.save(saved); };
  sim.pin = pinFor();

  // landings on the rug: the strongest two per 40 ms, louder the faster they land
  let lastLanding = 0;
  function playLandings(now) {
    if (!impacts.length) return;
    if (now - lastLanding > 40) {
      const hits = [];
      for (let j = 0; j < impacts.length; j += 2) hits.push([impacts[j], impacts[j + 1]]);
      hits.sort((a, b) => b[1] - a[1]);
      for (const [i, speed] of hits.slice(0, 2)) click(0.15 + 0.6 * Math.max(0, Math.min(1, (speed - 1.5) / 20)) ** 0.7, { soft: true });
      lastLanding = now;
    }
    impacts.length = 0;
  }
  // drag: hanging on the finger the strand settles like a real one (friction between beads,
  // the thread dragging over the finger); dropped on the rug it falls freely
  const DRAG = { count: 11, hold: 0.4 };
  sim.drag = DRAG.count;

  function startAdvance(auto) {
    if (!started || resting || mode !== 'count' || rehang) return;
    // a tap made while a bead is still moving is queued, never dropped: every tap is one bead
    if (adv) { if (!auto) queued++; return; }
    passPin((sim.pin + 1) % NL);
    const k = 3 * sim.pin;
    const dx = X[k] - PEG.x, dy = X[k + 1] - PEG.y, a0 = Math.atan2(dy, dx);
    let da = Math.PI / 2 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    // an unhurried pass takes 0.17 s; with taps waiting, each pass quickens (down to 0.05 s,
    // the fastest the thread constraints follow cleanly) so the strand catches up
    const dur = queued > 0 || auto ? clamp(0.1 - 0.008 * queued, 0.05, 0.1) : 0.17;
    adv = { t: 0, dur, a0, a1: a0 + da, r0: Math.hypot(dx, dy), r1: PEG_R + RAD[sim.pin] + 0.001, z0: X[k + 2] };
    if (!auto) { click(1); try { navigator.vibrate && navigator.vibrate(6); } catch (e) {} }
  }
  function arrive() {
    const { pin } = sim;
    if (KIND[pin] === 1) { click(0.6); startAdvance(true); return; }   // separators pass on their own
    // the bead settling onto the finger: a softer tick, skipped while taps are waiting so a
    // fast run doesn't double up
    if (queued === 0) click(0.45, { delay: 0.05 });
    count++;
    persist();
    const set = currentSet(), v = dhikr.view(set, count);
    if (v.complete) {
      // the set is complete: clear any taps still waiting, rest on its closing words, then a new round
      resting = true; queued = 0;
      chime(); pulse(3);
      showCount();
      ui.moment.show(set.done, () => { count = 0; round++; resting = false; persist(); showCount(); });
      return;
    }
    if (v.blockEnd) { bell(); pulse(2.6); } else pulse(1);   // the end of each thirty-three
    showCount();
    if (queued > 0) { queued--; startAdvance(false); }
  }

  // per fixed step: advance arc, re-hanging, peg motion
  function animate(dt) {
    if (adv) {
      adv.t += dt / adv.dur;
      const e = easeOut(Math.min(1, adv.t));
      const a = adv.a0 + (adv.a1 - adv.a0) * e, r = adv.r0 + (adv.r1 - adv.r0) * e;
      sim.pinTo = [PEG.x + Math.cos(a) * r, PEG.y + Math.sin(a) * r, adv.z0 * (1 - e)];
      if (adv.t >= 1) { adv = null; arrive(); }
    }
    if (rehang) {
      rehang.t += dt;
      const tA = 1.1, top = pinTop(sim.pin);
      if (rehang.t < tA) {
        const e = easeInOut(rehang.t / tA);
        sim.pinTo = rehang.from.map((v, c) => v + (top[c] - v) * e);
      } else { sim.pinTo = top; sim.pegGoal = PEG_FRONT; }
      sim.bias = rehang.t > tA - 0.35 && rehang.t < tA + 0.8 ? 14 : 0;
      if (rehang.t > tA + 1.3) { rehang = null; sim.bias = 0; }
    }
    const sp = 6 * dt;
    sim.pegEnd += clamp(sim.pegGoal - sim.pegEnd, -sp, sp);
  }

  // ── modes ──
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    sim.drag = DRAG[m];
    ui.showMode(m);
    queued = 0;
    if (m === 'hold') {
      adv = null;
      rehang = null; sim.bias = 0;
      dropPin();
      sim.pegGoal = PEG_BACK;
    } else {
      releaseGrab();
      holdPin();
      sim.pegGoal = PEG_BACK;
      rehang = { t: 0, from: sim.pinFrom.slice() };
    }
    rig.preset(mode);
    input.setCursor();
  }
  // lay the strand out afresh at the current count (Reset, or choosing another set)
  function rehangAtCount() {
    adv = null; queued = 0; rehang = null; sim.bias = 0; releaseGrab();
    sim.pin = pinFor();
    layoutHang(); settle(150);
    if (mode === 'hold') { dropPin(); sim.pegGoal = PEG_BACK; }
    showCount();
  }
  function reset() { count = 0; round = 1; persist(); rehangAtCount(); }
  function chooseSet(key) {
    if (key === setKey) return;
    persist();
    setKey = key; ({ count, round } = dhikr.progressOf(saved, key));
    persist();
    ui.showSetName(setName());
    rehangAtCount();
  }
  const setName = () => setKey === 'custom' ? `Your own · ${saved.custom.phrase.length > 26 ? saved.custom.phrase.slice(0, 25) + '…' : saved.custom.phrase}` : currentSet().name;
  ui.showSetName(setName());
  ui.bindPanel({
    getSets: () => ({
      current: setKey,
      sets: dhikr.ORDER.map(key => {
        const set = dhikr.preset(key, saved.custom), first = set.blocks[0][1], p = dhikr.progressOf(saved, key);
        return {
          key, name: key === 'custom' ? `Your own: ${saved.custom.phrase}` : set.name, detail: set.detail, ar: first.ar,
          progress: p.count === 0 && p.round === 1 ? 'Not started' : `${p.count} of ${set.target}${p.round > 1 ? ` · round ${p.round}` : ''}`,
        };
      }),
    }),
    getCustom: () => saved.custom,
    onPick: chooseSet,
    // a new custom phrase is a new set: it starts from zero
    onCustom: ({ phrase, meaning, target }) => {
      saved.custom = { phrase: phrase.slice(0, 80), meaning: meaning.slice(0, 120), target: dhikr.clampTarget(target) };
      saved.progress.custom = { count: 0, round: 1 };
      if (setKey === 'custom') { count = 0; round = 1; persist(); ui.showSetName(setName()); rehangAtCount(); }
      else chooseSet('custom');
    },
  });

  // ── controls ──
  function setVariety(key) {
    store.set('variety', key);
    strand.setVariety(key);
    ui.showVariety(key);
  }
  let soundOn = true;   // every visit starts with sound; the Sound button turns it off for this visit
  setSoundEnabled(soundOn);
  ui.showSound(soundOn);
  ui.buildSwatches(VARIETIES, setVariety);
  ui.bindControls({
    onMode: setMode,
    onNext: () => startAdvance(false),
    onSound: () => {
      soundOn = !soundOn;
      setSoundEnabled(soundOn);
      ui.showSound(soundOn);
      if (soundOn) click(0.6);
    },
    onReset: reset,
    onRoomTone: on => setAmbience(on),   // off by default, and not remembered
  });
  const input = attachInput({
    canvas: ui.canvas, camera, rig,
    getMode: () => mode,
    onPass: () => startAdvance(false),
    onUnlock: unlockAudio,
  });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    rig.preset(mode);
  }
  window.addEventListener('resize', resize);

  // ── boot ──
  const savedVariety = store.get('variety');
  setVariety(VARIETIES[savedVariety] ? savedVariety : 'amber');
  resize();
  rig.snap();
  ui.intro.progress(0.6);
  await yieldFrame();
  layoutHang();
  settle(180);
  showCount();
  input.setCursor();
  ui.intro.progress(0.72);
  await yieldFrame();
  // the room starts dark; compile every shader now so the first lit frame doesn't stall
  stage.setLightLevel(0); dust.setLevel(0);
  rig.update(0); strand.update(); hand.update(1, -1);
  await renderer.compileAsync(scene, camera);
  ui.intro.progress(0.92);
  await fonts;
  ui.intro.progress(1);

  // ── Begin: the title lifts away, the lamp fades up, the camera glides in ──
  let lampUp = null;
  ui.intro.onBegin(() => {
    if (started) return;
    unlockAudio();   // the Begin press or tap is the user gesture browsers require for audio
    started = true;
    ui.intro.begun();
    if (still()) { stage.setLightLevel(1); dust.setLevel(1); ui.revealPhrase(); return; }
    lampUp = { t: 0, delay: 0.3, dur: 2.2 };
    rig.glide('intro', 3.0);
    setTimeout(ui.revealPhrase, 2000);
  });

  let acc = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 4) { animate(1 / 60); step(1 / 60); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    playLandings(now);
    if (lampUp) {
      lampUp.t += dt;
      const e = easeInOut(clamp((lampUp.t - lampUp.delay) / lampUp.dur, 0, 1));
      stage.setLightLevel(e); dust.setLevel(e);
      if (e >= 1) lampUp = null;
    }
    glowTarget *= Math.exp(-dt / 0.3);
    glowLevel += (glowTarget - glowLevel) * (1 - Math.exp(-dt / 0.06));
    stage.pegGlow.intensity = glowLevel * PEG_GLOW;
    rig.update(dt);
    hand.update(dt, adv ? sim.pin : -1);   // the thumb follows the bead passing over the finger
    dust.update(dt);
    strand.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  renderer.render(scene, camera);
  ui.markReady();
  requestAnimationFrame(frame);
  ui.intro.loaded();
}
