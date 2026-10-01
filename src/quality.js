// Adaptive quality: the two costs that matter here are pixels (the pixel ratio) and the lamp's
// shadow map. The page starts at a level guessed from the device, then watches its own frame
// times and steps down when frames run long, or back up when there's room to spare.
//
// Levels, best first. Every level keeps antialiasing and soft shadows.
const LEVELS = [
  { ratio: 2, shadow: 2048 },
  { ratio: 1.5, shadow: 1024 },
  { ratio: 1.25, shadow: 1024 },
  { ratio: 1, shadow: 512 },
];
const WINDOW = 90;        // frames per measurement (1.5 s at 60 fps)
const SLOW_MS = 1000 / 52; // a median frame longer than this (under ~52 fps): step down
const FAST_MS = 17.5;      // at or under a 60 Hz frame for UP_AFTER windows in a row: try a step up
                          // (a display caps the frame rate, so keeping up is all a page can see)
const UP_AFTER = 8;

// a first guess, before any frames: small or old devices start lower
function guess(renderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const cores = navigator.hardwareConcurrency || 4, memory = navigator.deviceMemory || 4;
  if (/Mali-[4T]|Adreno \(TM\) [345]\d\d|PowerVR|SGX|Intel\(R\) HD Graphics [2-5]/i.test(gpu) || memory <= 2 || cores <= 2) return 3;
  if (memory <= 4 && cores <= 4) return 2;
  // phones and tablets run their high pixel ratios on small GPUs: start one step down
  if (matchMedia('(pointer: coarse)').matches && (window.devicePixelRatio || 1) > 2) return 1;
  return 0;
}

export function createQuality({ renderer, lamp, onChange = () => {} }) {
  let level = -1, times = [], fastRuns = 0, ceiling = 0, settleUntil = 0, pinned = false;
  const cap = () => Math.min(window.devicePixelRatio || 1, 2);
  function apply(next, now = performance.now()) {
    next = Math.max(ceiling, Math.min(LEVELS.length - 1, next));
    if (next === level) return;
    level = next;
    const L = LEVELS[level];
    renderer.setPixelRatio(Math.min(cap(), L.ratio));
    if (lamp.shadow.mapSize.x !== L.shadow) {
      lamp.shadow.mapSize.set(L.shadow, L.shadow);
      if (lamp.shadow.map) { lamp.shadow.map.dispose(); lamp.shadow.map = null; }   // rebuilt at the new size on the next frame
    }
    times = []; fastRuns = 0;
    settleUntil = now + 1000;   // the frame after a change is slow; don't measure it
    onChange(level);
  }
  apply(guess(renderer));

  return {
    get level() { return level; },
    get ratio() { return renderer.getPixelRatio(); },
    // called once per frame with the time since the last frame, in ms
    frame(ms, now) {
      // a hidden tab, a hitch or a throttled preview says nothing about rendering cost
      if (pinned || document.hidden || ms > 100 || now < settleUntil) return;
      times.push(ms);
      if (times.length < WINDOW) return;
      times.sort((a, b) => a - b);
      const median = times[times.length >> 1];
      times = [];
      if (median > SLOW_MS && level < LEVELS.length - 1) {
        // if a step up just failed, don't try that level again
        if (fastRuns === -1) ceiling = level + 1;
        apply(level + 1, now);
      } else if (median < FAST_MS && level > ceiling) {
        if (++fastRuns >= UP_AFTER) { apply(level - 1, now); fastRuns = -1; }   // -1: on probation at the new level
      } else if (fastRuns === -1) fastRuns = 0;   // the new level held: probation over
    },
    // dev: pin a level (the governor stops), or unpin with null
    set(l) { pinned = l !== null; ceiling = 0; if (pinned) apply(l); },
    // the pixel ratio follows the device (a window moved to another screen)
    refresh() { renderer.setPixelRatio(Math.min(cap(), LEVELS[level].ratio)); },
  };
}
