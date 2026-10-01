// Records a ~26 s screen capture of the page for a submission: the title, Begin, counting
// through the thirty-third bead, Hold and a dragged bead, back to Count, a turn of the view.
// Writes capture/misbaha.mp4 (1920 × 1080, 60 fps, with sound). Needs the dev server running.
// Run: npm run record
//
// Pictures: Chrome's screencast sends a frame each time the page repaints, with its time;
// ffmpeg holds each frame until the next one, so the video keeps real time.
// Sound: every connection to the speakers is also routed into a recorder in the page.
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { launch } from './lib/render.mjs';

const PAGE = process.env.MISBAHA_URL || 'http://localhost:5186/';
const dir = new URL('../capture/', import.meta.url).pathname, frames = dir + 'frames/';
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
const W = 1920, H = 1080;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// start at the 27th bead of the tasbīḥ, so the thirty-third (the bell) comes early
await page.addInitScript(() => {
  localStorage.setItem('misbaha.variety', 'amber');
  localStorage.setItem('misbaha.dhikr', JSON.stringify({ current: 'tasbih', progress: { tasbih: { count: 27, round: 1 } } }));
  // route the page's sound into a recorder too
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const ac = dest.context;
      if (!ac.__tap) {
        ac.__tap = ac.createMediaStreamDestination();
        const rec = new MediaRecorder(ac.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
        const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
        window.__audio = { rec, chunks, start: Date.now() };
        rec.start(250);
      }
      connect.call(this, ac.__tap);
    }
    return connect.call(this, dest, ...rest);
  };
});
await page.goto(PAGE);
await page.waitForSelector('body.loaded');
await page.evaluate(() => window.__stage.quality.set(0));
await page.mouse.move(W - 80, H - 80);

const cdp = await page.context().newCDPSession(page);
const shots = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const name = `${String(shots.length).padStart(5, '0')}.jpg`;
  writeFileSync(frames + name, Buffer.from(data, 'base64'));
  shots.push({ name, t: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
const wait = s => page.waitForTimeout(s * 1000);
const at = async sel => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const glide = async ([x, y], steps = 24) => page.mouse.move(x, y, { steps });
const beadXY = i => page.evaluate(async i => {
  const find = f => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(f));
  const P = await import(find('/src/physics.js'));
  const cam = window.__stage.camera, v = new cam.position.constructor(P.X[3 * i], P.X[3 * i + 1], P.X[3 * i + 2]).project(cam);
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
}, i);

await wait(2.2);                                   // the title
await page.keyboard.press('Space');                // Begin: the lamp, the glide in
await wait(3.4);
await glide(await at('#ambience'), 30); await page.mouse.click(...await at('#ambience'));   // the flute
await wait(0.6);
await glide([W * 0.5, H * 0.55], 34); await wait(0.3);
for (let i = 0; i < 9; i++) { await page.mouse.click(W * 0.5 + (i % 3) * 6, H * 0.55); await wait(i === 5 ? 1.6 : 0.62); }   // 28…36, the bell at 33
await glide(await at('#modeHold'), 30); await page.mouse.click(...await at('#modeHold'));
await wait(2.4);
const b = await beadXY(40);
await glide(b, 30); await wait(0.3);
await page.mouse.down();
await page.mouse.move(b[0] + 40, b[1] - 260, { steps: 40 }); await wait(0.6);
await page.mouse.move(b[0] + 140, b[1] - 200, { steps: 30 }); await wait(0.5);
await page.mouse.up(); await wait(1.6);            // dropped: it falls back to the rug
await glide(await at('#modeCount'), 30); await page.mouse.click(...await at('#modeCount'));
await wait(2.2);
await glide([W * 0.5, H * 0.55], 30);
for (let i = 0; i < 3; i++) { await page.mouse.click(W * 0.5, H * 0.55); await wait(0.62); }
await page.mouse.move(W * 0.62, H * 0.7); await page.mouse.down();
await page.mouse.move(W * 0.575, H * 0.69, { steps: 50 }); await page.mouse.up();   // a slow, small turn of the view
await wait(2.5);

await cdp.send('Page.stopScreencast');
const audio = await page.evaluate(async () => {
  const a = window.__audio; if (!a) return null;
  await new Promise(r => { a.rec.onstop = r; a.rec.stop(); });
  const buf = await new Blob(a.chunks).arrayBuffer();
  let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { b64: btoa(s), start: a.start / 1000 };
});
const end = Date.now() / 1000;
await browser.close();

// each frame lasts until the next; the video starts at the first frame
const list = shots.map((f, i) => `file '${frames}${f.name}'\nduration ${((shots[i + 1]?.t ?? end) - f.t).toFixed(4)}`).join('\n') + `\nfile '${frames}${shots.at(-1).name}'\n`;
writeFileSync(dir + 'frames.txt', list);
const args = ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', dir + 'frames.txt'];
if (audio) {
  writeFileSync(dir + 'audio.webm', Buffer.from(audio.b64, 'base64'));
  // line the sound up with the pictures: the recorder started this long after the first frame
  args.push('-itsoffset', (audio.start - shots[0].t).toFixed(3), '-i', dir + 'audio.webm', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k');
}
args.push('-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', dir + 'misbaha.mp4');
execFileSync('ffmpeg', args);
console.log(`capture/misbaha.mp4: ${shots.length} frames over ${(end - shots[0].t).toFixed(1)} s (${(shots.length / (end - t0)).toFixed(0)} fps captured)${audio ? ', with sound' : ''}`);
