// Boot, the counting / mode controller, and the frame loop.
import { chime, clack, setSoundEnabled, setVoice, unlockAudio } from './audio.js';
import { createDust } from './dust.js';
import { attachInput } from './input.js';
import {
  KIND, NL, PEG, PEG_BACK, PEG_FRONT, PEG_R, RAD, X, beadNo, clamp, dropPin, holdPin,
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

let stage;
try { stage = createStage(ui.canvas); } catch (e) { ui.showFallback(); }
if (stage) boot(stage);

function boot(stage) {
  const { renderer, scene, camera } = stage;
  const tex = makeTextures(renderer);
  const room = addRoom(scene, tex, stage.dimEnv);
  // dev-only handle for tuning light levels live; stripped from production builds
  if (import.meta.env.DEV) window.__stage = { ...stage, ...room };
  const strand = createStrand(scene, tex);
  strand.materials.forEach(stage.gateToLamp);
  const rig = createRig(camera);
  const dust = createDust(scene, stage.lamp, renderer);

  // ── counting state ──
  // adv: the bead currently travelling onto the peg; queued: taps made while it travels
  // rehang: the lift back onto the peg after Hold mode
  let mode = 'count', completed = false, round = 1, adv = null, queued = 0, rehang = null;
  const showCount = () => ui.showCount(beadNo(sim.pin), completed, round);

  function startAdvance(auto) {
    if (mode !== 'count' || rehang) return;
    if (adv) { if (!auto) queued = Math.min(queued + 1, 6); return; }
    passPin((sim.pin + 1) % NL);
    const k = 3 * sim.pin;
    const dx = X[k] - PEG.x, dy = X[k + 1] - PEG.y, a0 = Math.atan2(dy, dx);
    let da = Math.PI / 2 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    adv = { t: 0, dur: (queued > 0 || auto) ? 0.1 : 0.17, a0, a1: a0 + da, r0: Math.hypot(dx, dy), r1: PEG_R + RAD[sim.pin] + 0.001, z0: X[k + 2] };
    if (!auto) { clack(1); try { navigator.vibrate && navigator.vibrate(6); } catch (e) {} }
  }
  function arrive() {
    const { pin } = sim;
    if (KIND[pin] === 1) { clack(0.6); startAdvance(true); return; }   // separators pass on their own
    if (pin === 0) { completed = true; chime(); }
    else if (completed) { completed = false; round++; }
    clack(0.45, 0.05);
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
  function reset() {
    adv = null; queued = 0; rehang = null; sim.bias = 0; releaseGrab();
    sim.pin = 0; completed = false; round = 1;
    layoutHang(); settle(150);
    if (mode === 'hold') { dropPin(); sim.pegGoal = PEG_BACK; }
    showCount();
  }

  // ── controls ──
  function setVariety(key) {
    store.set('variety', key);
    strand.setVariety(key);
    setVoice(VARIETIES[key].clack);
    ui.showVariety(key);
  }
  let soundOn = store.get('sound') !== 'off';
  setSoundEnabled(soundOn);
  ui.showSound(soundOn);
  ui.buildSwatches(VARIETIES, setVariety);
  ui.bindControls({
    onMode: setMode,
    onNext: () => startAdvance(false),
    onSound: () => {
      soundOn = !soundOn; store.set('sound', soundOn ? 'on' : 'off');
      setSoundEnabled(soundOn);
      ui.showSound(soundOn);
      if (soundOn) clack(0.6);
    },
    onReset: reset,
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
  const saved = store.get('variety');
  setVariety(VARIETIES[saved] ? saved : 'amber');
  resize();
  rig.snap();
  layoutHang();
  settle(180);
  showCount();
  input.setCursor();

  let acc = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 4) { animate(1 / 60); step(1 / 60); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    rig.update(dt);
    dust.update(dt);
    strand.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  rig.update(0);
  strand.update();
  renderer.render(scene, camera);
  ui.markReady();
  requestAnimationFrame(frame);
}
