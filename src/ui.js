// Everything in the DOM: the dhikr header, the control rail, the hint and the fallback.
const $ = id => document.getElementById(id);
export const canvas = $('gl');

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
const arDigits = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp01 = v => Math.max(0, Math.min(1, v));

let shownPhrase = -1;
// c: beads counted this round (0..99); completed: the imam was reached after bead 99
export function showCount(c, completed, round) {
  if (completed) c = 99;
  const block = completed ? 3 : c === 0 ? 0 : Math.floor((c - 1) / 33);
  const inBlock = completed ? 100 : c - 33 * Math.min(block, 2);
  if (block !== shownPhrase) {
    const ph = PHRASES[block], el = $('phrase');
    const apply = () => { $('ar').textContent = ph.ar; $('tr').textContent = ph.tr; $('gs').textContent = ph.gs; el.classList.remove('swap'); };
    if (shownPhrase < 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) apply();
    else { el.classList.add('swap'); setTimeout(apply, 220); }
    shownPhrase = block;
  }
  $('num').textContent = inBlock;
  $('of').textContent = completed ? '' : '/ 33';
  $('arnum').textContent = arDigits(inBlock);
  for (let k = 0; k < 3; k++) $('b' + k).style.width = (clamp01((c - 33 * k) / 33) * 100) + '%';
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

export function showFallback() { $('fallback').hidden = false; canvas.hidden = true; }
export function markReady() { document.body.classList.add('ready'); }
