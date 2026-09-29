// Procedural canvas textures: wood grain, amber clouds, tassel fringe, prayer rug.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { clamp, rng, RNG_SEED, RNG_SKIP } from './physics.js';

export function makeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  }

  // wood grain: rings around the bore (sphere v runs pole to pole along the thread)
  const grain = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const warp = Math.sin(u * Math.PI * 4 + v * 9) * 0.018 + Math.sin(u * Math.PI * 10 + 1.3) * 0.008;
      const ring = Math.pow(0.5 + 0.5 * Math.sin((v + warp) * 38 * Math.PI * 2), 6);
      const fine = 0.5 + 0.5 * Math.sin((v + warp * 1.6) * 260);
      const L = clamp(0.98 - ring * 0.34 - fine * 0.06, 0, 1);
      const k = (y * w + x) * 4;
      img.data[k] = 255 * L; img.data[k + 1] = 245 * L; img.data[k + 2] = 232 * L; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });

  // amber: soft cloudy inclusions, wrapped so the seam is invisible
  const cloud = canvasTex(256, 128, (g, w, h) => {
    const R = rng(RNG_SEED, RNG_SKIP.cloud);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const x = R() * w, y = R() * h, r = 6 + R() * 26, dark = R() < 0.55;
      for (const dx of [-w, 0, w]) {
        const grd = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        grd.addColorStop(0, dark ? 'rgba(140,60,15,.24)' : 'rgba(255,238,196,.4)');
        grd.addColorStop(1, dark ? 'rgba(140,60,15,0)' : 'rgba(255,238,196,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x + dx, y, r, 0, 7); g.fill();
      }
    }
  });

  const fringe = canvasTex(128, 8, (g, w, h) => {
    const R = rng(RNG_SEED, RNG_SKIP.fringe);
    for (let x = 0; x < w; x++) { const L = (0.62 + R() * 0.38) * 255 | 0; g.fillStyle = `rgb(${L},${L},${L})`; g.fillRect(x, 0, 1, h); }
  });

  // prayer-rug ground: madder red wool with a khatam (eight-point star) lattice
  const rug = canvasTex(512, 512, (g, w, h) => {
    const R = rng(RNG_SEED, RNG_SKIP.rug);
    g.fillStyle = '#2e1216'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const px = (i / 4) % w, py = (i / 4 / w) | 0;
      const n = (R() - 0.5) * 16 + ((px + py) % 2 ? 3 : -3);
      img.data[i] += n; img.data[i + 1] += n * 0.55; img.data[i + 2] += n * 0.55;
    }
    g.putImageData(img, 0, 0);
    const khatam = (cx, cy, r, fill) => {
      for (const rot of [0, Math.PI / 4]) {
        g.beginPath();
        for (let k = 0; k < 4; k++) { const a = rot + Math.PI / 4 + k * Math.PI / 2; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.closePath(); fill ? g.fill() : g.stroke();
      }
    };
    const pts = [[256, 256], [0, 0], [512, 0], [0, 512], [512, 512]];
    g.fillStyle = 'rgba(24,46,56,.3)'; for (const [x, y] of pts) khatam(x, y, 46, true);
    g.strokeStyle = 'rgba(214,168,96,.14)'; g.lineWidth = 3; for (const [x, y] of pts) khatam(x, y, 118);
    g.strokeStyle = 'rgba(214,168,96,.08)'; g.lineWidth = 2; for (const [x, y] of pts) khatam(x, y, 76);
    g.strokeStyle = 'rgba(214,168,96,.05)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  });
  rug.wrapS = rug.wrapT = RepeatWrapping;
  rug.repeat.set(10, 10);

  return { grain, cloud, fringe, rug };
}
