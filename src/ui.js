// Everything in the DOM: the title screen, the dhikr header, the control rail, the hint and
// the fallback.
const $ = id => document.getElementById(id);
export const canvas = $('gl');
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

const PHRASES = [
  { ar: 'سُبْحَانَ ٱللَّٰهِ', tr: 'Subḥāna-llāh', gs: 'Glory be to God' },
  { ar: 'ٱلْحَمْدُ لِلَّٰهِ', tr: 'Al-ḥamdu li-llāh', gs: 'All praise belongs to God' },
  { ar: 'ٱللَّٰهُ أَكْبَرُ', tr: 'Allāhu akbar', gs: 'God is the greatest' },
  { ar: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ', tr: 'Lā ilāha illa-llāhu waḥdahu lā sharīka lah', gs: 'There is no god but God alone, He has no partner. The hundred is complete.' },
];
const HINTS = {
  count: 'Tap anywhere or press Space to pass one bead over the peg. Drag to turn the view.',
  hold: 'Drag any bead to lift the strand. Drag empty space to turn the view, scroll to zoom.',
};
const WESTERN = '0123456789', ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const arDigits = n => String(n).replace(/\d/g, d => ARABIC_INDIC[d]);
const clamp01 = v => Math.max(0, Math.min(1, v));

// ── odometer: each digit rolls on a strip of 0–9 ──
// A hidden copy of the digit gives the column its width and baseline; the strip rolls in a
// clipped window over it. Columns are right-aligned: added or removed on the left.
function odometer(el, glyphs) {
  const cols = [];
  const make = () => {
    const c = document.createElement('span');
    c.className = 'od-col';
    c.innerHTML = `<span class="od-ghost"></span><span class="od-win"><span class="od-strip">${[...glyphs].map(g => `<span>${g}</span>`).join('')}</span></span>`;
    return c;
  };
  const roll = (c, d, animate) => {
    c.firstChild.textContent = d;
    const strip = c.querySelector('.od-strip');
    strip.style.transition = animate && !still() ? '' : 'none';
    strip.style.transform = `translateY(calc(${-glyphs.indexOf(d)} * var(--lh)))`;
  };
  return (text, animate) => {
    const digits = [...text];
    while (cols.length > digits.length) cols.shift().remove();
    while (cols.length < digits.length) { const c = make(); el.prepend(c); cols.unshift(c); roll(c, glyphs[0], false); c.offsetWidth; }
    digits.forEach((d, i) => roll(cols[i], d, animate));
  };
}
const numOdo = odometer($('num'), WESTERN), arOdo = odometer($('arnum'), ARABIC_INDIC);

// ── phrases: revealed word by word from below ──
function fillWords(el, text, start) {
  el.textContent = '';
  text.split(' ').forEach((w, i) => {
    if (i) el.append(' ');
    const s = document.createElement('span');
    s.className = 'w'; s.style.setProperty('--i', start + i); s.textContent = w;
    el.append(s);
  });
  return start + text.split(' ').length;
}
function setPhrase(ph) {
  let i = fillWords($('ar'), ph.ar, 0);
  i = fillWords($('tr'), ph.tr, i);
  fillWords($('gs'), ph.gs, i);
}
let revealed = false;
// the first phrase waits for the header to appear after Begin
export async function revealPhrase() {
  revealed = true;
  await nextFrame();
  $('phrase').classList.add('in');
}

// ── the tick ring: one mark per body on the strand, in strand order, clockwise from the
// top. The imām is a long mark at the top, the two separators are dots, beads are ticks.
const RING = { n: 102, sep: [34, 68] };
const ringMarks = (() => {
  const svg = $('ring'), ns = 'http://www.w3.org/2000/svg', marks = [];
  for (let i = 0; i < RING.n; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / RING.n, c = Math.cos(a), s = Math.sin(a);
    let el;
    if (RING.sep.includes(i)) {
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('cx', (54 * c).toFixed(2)); el.setAttribute('cy', (54 * s).toFixed(2)); el.setAttribute('r', '2');
      el.setAttribute('class', 'sep');
    } else {
      const [r0, r1] = i === 0 ? [41, 61] : [50, 58];
      el = document.createElementNS(ns, 'line');
      el.setAttribute('x1', (r0 * c).toFixed(2)); el.setAttribute('y1', (r0 * s).toFixed(2));
      el.setAttribute('x2', (r1 * c).toFixed(2)); el.setAttribute('y2', (r1 * s).toFixed(2));
      el.setAttribute('class', i === 0 ? 't imam' : 't');
    }
    svg.appendChild(el); marks.push(el);
  }
  return marks;
})();
// bead number (0–99) → its place on the strand (separators sit after beads 33 and 66)
const strandIndex = c => c <= 33 ? c : c <= 66 ? c + 1 : c + 2;
function showRing(c, completed) {
  const at = completed ? 0 : strandIndex(c);
  ringMarks.forEach((el, i) => {
    el.classList.toggle('on', completed || (i > 0 && i <= at));
    el.classList.toggle('now', i === at && (i > 0 || completed));
  });
}

let shownPhrase = -1, counted = false;
// c: beads counted this round (0..99); completed: the imam was reached after bead 99
export function showCount(c, completed, round) {
  if (completed) c = 99;
  const block = completed ? 3 : c === 0 ? 0 : Math.floor((c - 1) / 33);
  const inBlock = completed ? 100 : c - 33 * Math.min(block, 2);
  if (block !== shownPhrase) {
    const ph = PHRASES[block], el = $('phrase');
    if (shownPhrase < 0 || !revealed || still()) { setPhrase(ph); if (revealed) el.classList.add('in'); }
    else {
      el.classList.add('out');
      setTimeout(async () => {
        el.classList.remove('in', 'out'); setPhrase(ph);
        await nextFrame(); el.offsetWidth; el.classList.add('in');
      }, 260);
    }
    shownPhrase = block;
  }
  numOdo(String(inBlock), counted);
  arOdo(arDigits(inBlock), counted);
  counted = true;
  $('countText').textContent = completed ? '100: the tahlīl' : `${inBlock} of 33`;
  $('of').textContent = completed ? '' : '/ 33';
  showRing(c, completed);
  $('total').textContent = completed ? '99 of 99, then the tahlīl' : `${c} of 99`;
  $('round').textContent = `Round ${round}`;
}

export function buildSwatches(varieties, onPick) {
  const sw = $('swatches');
  for (const [k, v] of Object.entries(varieties)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.key = k; b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="dot" style="--c:${v.css}"></span><span>${v.name}</span>`;
    b.addEventListener('click', () => onPick(k));
    sw.appendChild(b);
  }
}
export function showVariety(key) {
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.key === key)));
}

export function showMode(m) {
  $('modeCount').setAttribute('aria-pressed', String(m === 'count'));
  $('modeHold').setAttribute('aria-pressed', String(m === 'hold'));
  $('countGroup').hidden = m !== 'count';
  $('hint').textContent = HINTS[m];
}

export function showSound(on) {
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound').textContent = on ? 'Sound on' : 'Sound off';
}

export function bindControls({ onMode, onNext, onSound, onReset }) {
  $('modeCount').addEventListener('click', () => onMode('count'));
  $('modeHold').addEventListener('click', () => onMode('hold'));
  $('next').addEventListener('click', onNext);
  $('sound').addEventListener('click', onSound);
  $('reset').addEventListener('click', onReset);
  // A mouse or touch click leaves focus on the button, which would swallow Space.
  // Hand focus back to the beads; keyboard clicks (detail 0) keep it for Tab navigation.
  document.querySelector('.rail').addEventListener('click', e => {
    if (e.detail > 0 && e.target.closest('button')) canvas.focus({ preventScroll: true });
  });
}

export function showFallback() { $('fallback').hidden = false; canvas.hidden = true; $('intro').hidden = true; }
export function markReady() { document.body.classList.add('ready'); }

// ── the hundredth: the full tahlīl ──
// The formula for completing the hundred after the prayer, as reported in Ṣaḥīḥ Muslim.
const TAHLIL = {
  // one natural phrase per line, so no line ever breaks inside a phrase
  ar: ['لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ،', 'لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ،', 'وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ'],
  tr: ['Lā ilāha illa-llāhu waḥdahu lā sharīka lah,', 'lahu-l-mulku wa lahu-l-ḥamdu, wa huwa ʿalā kulli shayʾin qadīr.'],
  gs: 'There is no god but God alone, without partner. His is the dominion and His is the praise, and He has power over all things.',
};
// lines of words, revealed in order; a hyphenated word is kept whole so it never splits
function fillLines(el, lines, start, perWord) {
  el.textContent = '';
  let i = start;
  for (const line of lines) {
    const row = document.createElement('span');
    row.className = 'line';
    line.split(' ').forEach((w, k) => {
      if (k) row.append(' ');
      const s = document.createElement('span');
      s.className = 'w'; s.style.setProperty('--i', perWord ? i++ : i); s.textContent = w;
      row.append(s);
    });
    if (!perWord) i++;
    el.append(row);
  }
  return i;
}
export const moment = {
  // shows the tahlīl; onNext runs when the visitor begins the next round. The prompt (and
  // the gesture that dismisses) waits until the words have appeared.
  show(onNext) {
    const el = $('moment');
    const words = fillLines($('momentAr'), TAHLIL.ar, 0, true);   // Arabic: word by word
    const after = fillLines($('momentTr'), TAHLIL.tr, words + 1, false);   // then each line whole
    $('momentGs').innerHTML = `<span class="w" style="--i:${after + 1}">${TAHLIL.gs}</span>`;
    el.hidden = false;
    document.body.classList.add('resting');
    let ready = false, done = false;
    const finish = () => {
      if (!ready || done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      el.removeEventListener('click', finish);
      el.classList.remove('show', 'ready');
      document.body.classList.remove('resting');
      setTimeout(() => { el.hidden = true; }, still() ? 0 : 1000);
      canvas.focus({ preventScroll: true });
      onNext();
    };
    // caught on the way down and stopped, like the title screen, so it can't pass a bead
    const onKey = e => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); } };
    window.addEventListener('keydown', onKey, true);
    el.addEventListener('click', finish);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => {
      ready = true;
      el.classList.add('ready');
      $('nextRound').focus({ preventScroll: true });
    }, still() ? 300 : 400 + (after + 1) * 90 + 900);
  },
};

// ── title screen ──
// Loads the exact faces the page uses and resolves when they're ready (or after 3 s, so a
// slow font can never block the page). Text is revealed only after, so nothing jumps.
export function loadFonts() {
  const faces = [
    document.fonts.load('italic 400 1em Amiri', 'Misbaḥa Subḥāna-llāh'),
    document.fonts.load('400 1em Amiri', 'سُبْحَانَ ٱللَّٰهِ ٠١٢٣٤٥٦٧٨٩ 0123456789'),
    document.fonts.load('500 1em "Instrument Sans Variable"', 'Count Hold Begin'),
  ];
  const timeout = new Promise(r => setTimeout(r, 3000));
  return Promise.race([Promise.all(faces).then(() => document.fonts.ready), timeout])
    .then(() => document.body.classList.add('fonts'));
}
export const intro = {
  progress(k) { $('introBar').style.width = (clamp01(k) * 100).toFixed(1) + '%'; },
  loaded() {
    document.body.classList.add('loaded');
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    $('introStatus').textContent = touch ? 'Ready. Tap anywhere to begin.' : 'Ready. Press Space to begin.';
    $('begin').focus({ preventScroll: true });
  },
  // Begin with Space or Enter, or a click or tap anywhere on the title screen. The key is
  // caught on the way down (window, capture phase) and stopped there, so the same press
  // can't also reach the counting handler and pass a bead.
  onBegin(cb) {
    let done = false;
    const go = () => {
      if (done || !document.body.classList.contains('loaded')) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      cb();
    };
    const onKey = e => {
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      go();
    };
    window.addEventListener('keydown', onKey, true);
    $('intro').addEventListener('click', go);
  },
  begun() {
    document.body.classList.add('begun');
    $('intro').setAttribute('aria-hidden', 'true');
    canvas.focus({ preventScroll: true });
  },
};
