// Shared by the colour scripts: open the dev build in headless Chrome (on the real GPU)
// and measure colours as they reach the screen. Needs the dev server running.
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { chromium } from 'playwright-core';

const URL = process.env.MISBAHA_URL || 'http://localhost:5186/';
const cache = `${homedir()}/Library/Caches/ms-playwright`;
const found = existsSync(cache) && readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
const executablePath = process.env.CHROME_PATH || (found && `${cache}/${found}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);

export async function launch() {
  return chromium.launch({ executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
}

// a page in Hold or Count mode with a bead material, settled, with measuring helpers installed
export async function open(browser, variety, mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript(v => localStorage.setItem('misbaha.variety', v), variety);
  await page.goto(URL);
  await page.waitForFunction(() => window.__stage);
  await page.waitForTimeout(1200);
  if (mode === 'hold') await page.click('#modeHold');
  await page.waitForTimeout(mode === 'hold' ? 6000 : 3000);
  await page.evaluate(() => {
    const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    window.__lab = (r, g, b) => {
      [r, g, b] = [lin(r), lin(g), lin(b)];
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    };
    const g = document.getElementById('gl'), c = document.createElement('canvas'); c.width = g.width; c.height = g.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    window.__grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { x.drawImage(g, 0, 0); res(x.getImageData(0, 0, c.width, c.height).data); })));
    window.__room = o => [__stage.rug, __stage.floor, __stage.wall].some(r => { for (let p = o; p; p = p.parent) if (p === r) return true; return false; });
  });
  return page;
}

// the beads' typical rendered colour (OKLab): median of the pixels that stay lit with the
// room hidden, plus the 75th-percentile lightness (the lit faces the eye judges them by)
export function beadColour(page) {
  return page.evaluate(async () => {
    const full = await __grab();
    const S = __stage, bg = S.scene.background, fog = S.scene.fog;
    for (const o of [S.rug, S.floor, S.wall]) o.visible = false; S.scene.background = null; S.scene.fog = null;
    const bare = await __grab();
    for (const o of [S.rug, S.floor, S.wall]) o.visible = true; S.scene.background = bg; S.scene.fog = fog;
    const L = [], A = [], B = [];
    for (let i = 0; i < full.length; i += 4) {
      if (0.2126 * bare[i] + 0.7152 * bare[i + 1] + 0.0722 * bare[i + 2] <= 2) continue;
      const [l, a, b] = __lab(full[i], full[i + 1], full[i + 2]); L.push(l); A.push(a); B.push(b);
    }
    const q = (v, f) => v.slice().sort((p, r) => p - r)[Math.floor(v.length * f)];
    return { lab: [q(L, 0.5), q(A, 0.5), q(B, 0.5)], Lhi: q(L, 0.75) };
  });
}

// where each surface is measured: the centre of the lamp's pool, or the wall where the glow is brightest
export function probePoint(page, surface) {
  return page.evaluate(surface => {
    const S = __stage;
    if (surface === 'wall') return [S.glow.position.x, S.glow.position.y, S.wall.position.z];
    const L = S.lamp, d = L.target.position.clone().sub(L.position).normalize(), t = -L.position.y / d.y;
    return L.position.clone().addScaledVector(d, t).toArray();
  }, surface);
}

// render each hex flat on a surface ('rug', 'floor' or 'wall') and read back its OKLab colour
export function surfaceColours(page, surface, hexes, point) {
  return page.evaluate(async ({ surface, hexes, point }) => {
    const S = __stage, hidden = [];
    S.scene.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible && !__room(o)) { o.visible = false; hidden.push(o); } });
    const meshes = []; S[surface].traverse(o => o.isMesh && meshes.push(o));
    if (surface === 'floor') S.rug.visible = false;
    const saved = meshes.map(m => [m.material.map, m.material.color.getHex()]);
    const v = new S.camera.position.constructor(...point).project(S.camera);
    const g = document.getElementById('gl'), px = Math.round((v.x + 1) / 2 * g.width), py = Math.round((1 - v.y) / 2 * g.height);
    const out = {};
    for (const [k, h] of Object.entries(hexes)) {
      for (const m of meshes) { m.material.map = null; m.material.color.set(h); m.material.needsUpdate = true; }
      const d = await __grab();
      const s = [0, 0, 0]; let n = 0;
      for (let y = py - 6; y <= py + 6; y++) for (let x = px - 6; x <= px + 6; x++) { const i = (y * g.width + x) * 4; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
      out[k] = __lab(s[0] / n, s[1] / n, s[2] / n);
    }
    meshes.forEach((m, i) => { m.material.map = saved[i][0]; m.material.color.setHex(saved[i][1]); m.material.needsUpdate = true; });
    S.rug.visible = true; hidden.forEach(o => { o.visible = true; });
    return out;
  }, { surface, hexes, point });
}

// which surface and view each palette group is judged in
export const GROUPS = [
  { name: 'rug', surface: 'rug', view: 'hold', title: 'rug, at the centre of the pool (Hold)' },
  { name: 'floor', surface: 'floor', view: 'hold', title: 'floor beyond the rug (Hold)' },
  { name: 'wall', surface: 'wall', view: 'count', title: 'wall, where the glow is brightest (Count)' },
];

// the brightest pixels of the room with the strand hidden: the 99.9th-percentile OKLab
// lightness over every pixel, which catches even a small hotspot (a glossy reflection covers
// well under 1% of the frame, so a 99th percentile misses it)
export function peakLightness(page) {
  return page.evaluate(async () => {
    const S = __stage, hidden = [];
    S.scene.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible && !__room(o)) { o.visible = false; hidden.push(o); } });
    const d = await __grab();
    hidden.forEach(o => { o.visible = true; });
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(__lab(d[i], d[i + 1], d[i + 2])[0]);
    L.sort((p, q) => p - q);
    return L[Math.floor(L.length * 0.999)];
  });
}
