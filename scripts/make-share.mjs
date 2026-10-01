// Renders the link-preview image (public/og.jpg, 1200 × 630) and the home-screen icon
// (public/apple-touch-icon.png, 180 × 180). Needs the dev server running.
// Run: npm run make:share
//
// The preview is the real scene: the strand framed into the right of the picture, the
// controls hidden, the title set in the page's own type on the left. It's rendered at
// twice the size and scaled down, which smooths the edges.
import { execFileSync } from 'child_process';
import { launch } from './lib/render.mjs';

const PAGE = process.env.MISBAHA_URL || 'http://localhost:5186/';
const out = new URL('../public/', import.meta.url).pathname;
const browser = await launch();

const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.addInitScript(() => localStorage.setItem('misbaha.variety', 'amber'));
await page.goto(PAGE);
await page.waitForSelector('body.loaded');
await page.keyboard.press('Space');
await page.waitForTimeout(3800);
await page.evaluate(() => {
  window.__stage.quality.set(0);   // pinned: the governor stays out of it
  window.__stage.frameTo({ left: 560, top: 40, right: 1160, bottom: 600 });
  const style = document.createElement('style');
  style.textContent = `.dhikr, .rail, .hint, .cursor, .focus-frame { display: none !important; }
    .share-title { position: fixed; left: 84px; top: 50%; transform: translateY(-50%); width: 500px; z-index: 9; }
    .share-title h1 { font: italic 400 112px/1 var(--serif); margin: 0; color: var(--ink); }
    .share-title p { font: italic 400 26px/1.35 var(--serif); margin: 22px 0 0; color: var(--muted); }
    .share-title .ar { font: 400 40px/1.6 var(--arabic); color: var(--amber); margin: 0 0 6px; text-align: left; }`;
  document.head.appendChild(style);
  const t = document.createElement('div');
  t.className = 'share-title';
  t.innerHTML = '<p class="ar" lang="ar" dir="rtl">سُبْحَانَ ٱللَّٰهِ</p><h1>Misbaḥa</h1><p>Ninety-nine beads, passed one by one in remembrance.</p>';
  document.body.appendChild(t);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'og-2x.png' });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out + 'og-2x.png', '-vf', 'scale=1200:630:flags=lanczos', '-q:v', '3', out + 'og.jpg']);
execFileSync('rm', [out + 'og-2x.png']);

// the icon: the favicon's amber bead on the night background (iOS rounds the corners)
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`<body style="margin:0;background:#0f1217"><svg width="180" height="180" viewBox="0 0 32 32"><defs><radialGradient id="g" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f6bb55"/><stop offset="1" stop-color="#a4500c"/></radialGradient></defs><circle cx="16" cy="16" r="10.5" fill="url(#g)"/></svg></body>`);
await icon.screenshot({ path: out + 'apple-touch-icon.png' });
await browser.close();
console.log('wrote public/og.jpg and public/apple-touch-icon.png');
