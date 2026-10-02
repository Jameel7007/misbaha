// The adaptive quality governor, driven by simulated frame times. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = { devicePixelRatio: 3 };
globalThis.document = { hidden: false };
const { createQuality } = await import('../src/quality.js');

// a stand-in renderer and lamp: just enough for the governor to set
function rig() {
  const renderer = { r: 1, getContext: () => ({ getExtension: () => null }), setPixelRatio(r) { this.r = r; }, getPixelRatio() { return this.r; } };
  const lamp = { shadow: { mapSize: { x: 2048, set(a) { this.x = a; } }, map: null } };
  return { renderer, lamp, q: createQuality({ renderer, lamp }) };
}
// run the governor for `seconds`, each frame taking frameMs(pixel ratio) milliseconds
function run(q, renderer, seconds, frameMs) {
  let now = 0;
  while (now < seconds * 1000) { const ms = frameMs(renderer.getPixelRatio()); now += ms; q.frame(ms, now); }
}

test('a phone that reports no memory (Safari) starts sharp, at pixel ratio 2', () => {
  const { renderer } = rig();
  assert.equal(renderer.getPixelRatio(), 2);
});

test('a 30 fps cap (Low Power Mode) never lowers the resolution for long', () => {
  const { q, renderer } = rig();
  let now = 0, below = 0;
  while (now < 400000) { now += 1000 / 30; q.frame(1000 / 30, now); if (renderer.getPixelRatio() < 2) below += 1000 / 30; }
  assert.ok(below / now < 0.03, `below full sharpness ${(100 * below / now).toFixed(1)}% of the time`);
});

test('a load that grows with the pixels steps down until frames keep up', () => {
  const { q, renderer } = rig();
  run(q, renderer, 30, r => Math.max(1000 / 60, 10 * r * r));   // 40 ms at ratio 2
  assert.ok(renderer.getPixelRatio() < 2);
  assert.ok(10 * renderer.getPixelRatio() ** 2 <= 1000 / 52, `still slow at ratio ${renderer.getPixelRatio()}`);
});

test('a very slow device (under 10 fps) is still helped', () => {
  const { q, renderer } = rig();
  run(q, renderer, 30, r => Math.max(1000 / 60, 28 * r * r));   // 112 ms at ratio 2
  assert.equal(renderer.getPixelRatio(), 1);
});

test('when the load goes, quality climbs back, up to the full 3x of the screen', () => {
  const { q, renderer } = rig();
  run(q, renderer, 20, r => Math.max(1000 / 60, 10 * r * r));
  run(q, renderer, 120, () => 1000 / 60);
  assert.equal(renderer.getPixelRatio(), 3);
});

test('a hidden tab is ignored', () => {
  const { q, renderer } = rig();
  document.hidden = true;
  run(q, renderer, 20, () => 500);
  document.hidden = false;
  assert.equal(renderer.getPixelRatio(), 2);
});
