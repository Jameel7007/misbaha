// Adaptive quality: the two costs that matter here are pixels (the pixel ratio) and the lamp's
// shadow map. The page starts at a level guessed from the device, then watches its own frame
// times and steps down when frames run long, or back up when there's room to spare.
//
// Levels, best first. Every level keeps antialiasing and soft shadows.
const LEVELS = [
  { ratio: 3, shadow: 2048 },    // the full sharpness of a 3× phone screen, tried only when there's room to spare
  { ratio: 2, shadow: 2048 },
  { ratio: 1.5, shadow: 1024 },
  { ratio: 1.25, shadow: 1024 },
  { ratio: 1, shadow: 512 },
];
const WINDOW = 90, WINDOW_MS = 1500;   // a measurement: 90 frames or 1.5 s, whichever comes first (a slow device is judged as quickly)
const SLOW_MS = 1000 / 52; // a median frame longer than this (under ~52 fps): step down
const FAST_MS = 17.5;      // at or under a 60 Hz frame for UP_AFTER windows in a row: try a step up
                          // (a display caps the frame rate, so keeping up is all a page can see)
const UP_AFTER = 8;

// a first guess, before any frames: known-old GPUs and small devices start lower. What a
// browser doesn't say is unknown, not weak: Safari reports no memory and caps its core count,
// which once started every iPhone at pixel ratio 1.25, visibly soft on a 3× screen.
function guess(renderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const cores = navigator.hardwareConcurrency, memory = navigator.deviceMemory;
  if (/Mali-[4T]|Adreno \(TM\) [345]\d\d|PowerVR|SGX|Intel\(R\) HD Graphics [2-5]/i.test(gpu) || (memory && memory <= 2) || (cores && cores <= 2)) return 4;
  if (memory && memory <= 4 && cores && cores <= 4) return 3;
  return 1;   // pixel ratio 2; the governor tries the full ratio later if frames keep up
}

export function createQuality({ renderer, lamp, onChange = () => {} }) {
  // ceiling: the best level allowed (a step up there failed); floor: the lowest (stepping
  // below it didn't help). Both are lessons from a moment (a busy phone, Low Power Mode
  // switched on), so both expire and are learnt again if still true: the ceiling after a
  // minute, the floor after three (a frame-rate cap tends to last, and each re-test costs a
  // couple of seconds at the lower resolution). check: a step down on trial, with the median
  // it had to beat
  const CEILING_MS = 60000, FLOOR_MS = 180000;
  let level = -1, times = [], spent = 0, fastRuns = 0, ceiling = 0, floor = LEVELS.length - 1, ceilingSet = 0, floorSet = 0, check = null, settleUntil = 0, pinned = false;
  const cap = () => Math.min(window.devicePixelRatio || 1, 3);
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
    times = []; spent = 0; fastRuns = 0;
    settleUntil = now + 1000;   // the frame after a change is slow; don't measure it
    onChange(level);
  }
  apply(guess(renderer));

  return {
    get level() { return level; },
    get ratio() { return renderer.getPixelRatio(); },
    // called once per frame with the time since the last frame, in ms
    frame(ms, now) {
      // a hidden tab, a hitch or a throttled preview says nothing about rendering cost; frames
      // up to 250 ms (4 fps) still count, so a very slow device is still helped
      if (pinned || document.hidden || ms > 250 || now < settleUntil) return;
      times.push(ms); spent += ms;
      if (times.length < WINDOW && !(spent >= WINDOW_MS && times.length >= 8)) return;
      spent = 0;
      times.sort((a, b) => a - b);
      const median = times[times.length >> 1];
      times = [];
      if (ceiling > 0 && now - ceilingSet > CEILING_MS) ceiling = 0;
      if (floor < LEVELS.length - 1 && now - floorSet > FLOOR_MS) floor = LEVELS.length - 1;
      // a step down that didn't make frames at least 10% faster wasn't the answer: the limit
      // is elsewhere (a display or Low Power Mode capping at 30 fps, a busy processor). Undo
      // it, and don't lower the resolution below that again.
      if (check) {
        const c = check; check = null;
        if (median > c.median * 0.9) { floor = c.from; floorSet = now; apply(c.from, now); return; }
      }
      if (median > SLOW_MS && level < floor) {
        check = { from: level, median };
        // if a step up just failed, don't try that level again
        if (fastRuns === -1) { ceiling = level + 1; ceilingSet = now; }
        apply(level + 1, now);
      } else if (median < FAST_MS && level > ceiling) {
        if (++fastRuns >= UP_AFTER) { apply(level - 1, now); fastRuns = -1; }   // -1: on probation at the new level
      } else if (fastRuns === -1) fastRuns = 0;   // the new level held: probation over
    },
    // dev: pin a level (the governor stops), or unpin with null
    set(l) { pinned = l !== null; ceiling = 0; floor = LEVELS.length - 1; check = null; if (pinned) apply(l); },
    // the pixel ratio follows the device (a window moved to another screen)
    refresh() { renderer.setPixelRatio(Math.min(cap(), LEVELS[level].ratio)); },
  };
}
