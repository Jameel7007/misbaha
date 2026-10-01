// Everything in the DOM: the title screen, the dhikr header, the control rail, the hint and
// the fallback.
const $ = id => document.getElementById(id);
export const canvas = $('gl');
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

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
  const big = $('ar'), latin = !ph.ar;
  big.classList.toggle('latin', latin);
  big.setAttribute('lang', latin ? 'en' : 'ar'); big.setAttribute('dir', latin ? 'auto' : 'rtl');
  let i = fillWords(big, ph.ar || ph.big, 0);
  $('tr').hidden = !ph.tr; $('tr').textContent = '';
  if (ph.tr) i = fillWords($('tr'), ph.tr, i);
  $('gs').hidden = !ph.gs; $('gs').textContent = '';
  if (ph.gs) fillWords($('gs'), ph.gs, i);
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
// the ring mirrors the strand: `at` is the strand position on the finger (0 is the imām);
// loopDone lights the whole ring when the imām has just come round
function showRing(at, loopDone) {
  ringMarks.forEach((el, i) => {
    el.classList.toggle('on', loopDone || (i > 0 && i <= at));
    el.classList.toggle('now', i === at && (i > 0 || loopDone));
  });
}

let shownPhrase = '', counted = false;
// v: what dhikr.view() says to show; ring: { at, loopDone }; round: the round of this set
export function showTally(v, ring, round) {
  if (v.phraseKey !== shownPhrase) {
    const el = $('phrase');
    if (!shownPhrase || !revealed || still()) { setPhrase(v.phrase); if (revealed) el.classList.add('in'); }
    else {
      el.classList.add('out');
      setTimeout(async () => {
        el.classList.remove('in', 'out'); setPhrase(v.phrase);
        await nextFrame(); el.offsetWidth; el.classList.add('in');
      }, 260);
    }
    shownPhrase = v.phraseKey;
  }
  const n = String(v.number);
  numOdo(n, counted);
  arOdo(arDigits(n), counted);
  counted = true;
  $('countText').textContent = v.spoken;
  $('of').textContent = v.of;
  showRing(ring.at, ring.loopDone);
  $('total').textContent = v.total;
  $('round').textContent = `Round ${round}`;
}
export function showSetName(name) { $('setName').textContent = name; }

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

// Sound and Flute are one-word toggles: filled while on, with the state in aria-pressed
export function showSound(on) { $('sound').setAttribute('aria-pressed', String(on)); }

export function bindControls({ onMode, onNext, onSound, onReset, onRoomTone }) {
  $('ambience').addEventListener('click', () => {
    const on = $('ambience').getAttribute('aria-pressed') !== 'true';
    $('ambience').setAttribute('aria-pressed', String(on));
    onRoomTone(on);
  });
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

// ── the set picker and About ──
// sets: [{ key, name, detail, ar, progress }]; onPick(key); onCustom({ phrase, meaning, target })
let panelOpen = false;
export const isPanelOpen = () => panelOpen;
export function bindPanel({ getSets, getCustom, onPick, onCustom }) {
  const panel = $('panel');
  const view = about => { $('panelSets').hidden = about; $('panelAbout').hidden = !about; $('panelTitle').textContent = about ? 'About' : 'Choose a dhikr'; };
  // where focus goes after: back to the beads, so the next Space passes a bead (if it went to
  // the set button, Space would reopen the panel); Escape returns to the set button, as a
  // keyboard user expects
  const close = (toButton = false) => {
    if (!panelOpen) return;
    panelOpen = false; panel.classList.remove('show');
    setTimeout(() => { panel.hidden = true; }, still() ? 0 : 350);
    (toButton ? $('setBtn') : canvas).focus({ preventScroll: true });
  };
  const open = () => {
    const { sets, current } = getSets();
    const list = $('sets'); list.textContent = '';
    for (const st of sets) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'set'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(st.key === current));
      b.innerHTML = '<span class="set-name"></span><span class="set-ar" lang="ar" dir="rtl"></span><span class="set-detail"></span><span class="set-progress"></span>';
      b.children[0].textContent = st.name; b.children[1].textContent = st.ar || ''; b.children[2].textContent = st.detail; b.children[3].textContent = st.progress;
      b.addEventListener('click', () => { onPick(st.key); close(); });
      list.appendChild(b);
    }
    const c = getCustom();
    $('customPhrase').value = c.phrase; $('customMeaning').value = c.meaning; $('customTarget').value = c.target;
    view(false);
    panel.hidden = false; panelOpen = true;
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('show')));
    (list.querySelector('[aria-checked="true"]') || list.firstChild).focus({ preventScroll: true });
  };
  $('setBtn').addEventListener('click', open);
  $('panelClose').addEventListener('click', e => close(e.detail === 0));   // keyboard click: back to the set button
  panel.addEventListener('click', e => { if (e.target === panel) close(); });
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key !== 'Tab') return;
    // keep focus inside the dialog
    const f = [...panel.querySelectorAll('button, input')].filter(el => !el.closest('[hidden]') && el.offsetParent);
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });
  $('aboutOpen').addEventListener('click', () => { view(true); $('aboutBack').focus({ preventScroll: true }); $('panelAbout').scrollTop = 0; });
  $('aboutBack').addEventListener('click', () => { view(false); $('aboutOpen').focus({ preventScroll: true }); });
  $('customForm').addEventListener('submit', e => {
    e.preventDefault();
    const phrase = $('customPhrase').value.trim();
    if (!phrase) { $('customPhrase').focus(); return; }
    onCustom({ phrase, meaning: $('customMeaning').value.trim(), target: $('customTarget').value });
    close();
  });
}

export function showFallback() { $('fallback').hidden = false; canvas.hidden = true; $('intro').hidden = true; }
export function markReady() { document.body.classList.add('ready'); }

// ── the moment a set completes (for the tasbīḥ, the full tahlīl) ──
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
  // closing: { eyebrow, ar: [lines] or big: text, tr: [lines], gs }. onNext runs when the
  // visitor begins the next round. The prompt (and the gesture that dismisses) waits until
  // the words have appeared.
  show(closing, onNext) {
    const el = $('moment');
    $('momentTitle').textContent = closing.eyebrow;
    $('momentAr').hidden = !closing.ar; $('momentBig').hidden = !closing.big;
    let words = 0;
    if (closing.ar) words = fillLines($('momentAr'), closing.ar, 0, true);   // Arabic: word by word
    else words = fillLines($('momentBig'), [closing.big], 0, true);
    const after = fillLines($('momentTr'), closing.tr, words + 1, false);   // then each line whole
    const gs = document.createElement('span'); gs.className = 'w'; gs.style.setProperty('--i', after + 1); gs.textContent = closing.gs;
    $('momentGs').replaceChildren(gs);
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
