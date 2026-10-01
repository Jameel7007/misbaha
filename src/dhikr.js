// The dhikr sets: what is recited at each count, when a set is complete, and the progress
// saved on this device. Pure data and arithmetic; ui.js draws it and main.js drives it.

// ── phrases ──
const SUBHAN = { ar: 'سُبْحَانَ ٱللَّٰهِ', tr: 'Subḥāna-llāh', gs: 'Glory be to God' };
const HAMD = { ar: 'ٱلْحَمْدُ لِلَّٰهِ', tr: 'Al-ḥamdu li-llāh', gs: 'All praise belongs to God' };
const AKBAR = { ar: 'ٱللَّٰهُ أَكْبَرُ', tr: 'Allāhu akbar', gs: 'God is the greatest' };
const TAHLIL = { ar: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ', tr: 'Lā ilāha illa-llāhu waḥdahu lā sharīka lah', gs: 'There is no god but God alone, He has no partner. The hundred is complete.' };
const ISTIGHFAR = { ar: 'أَسْتَغْفِرُ ٱللَّٰهَ', tr: 'Astaghfiru-llāh', gs: 'I seek God’s forgiveness' };
const SALAWAT = { ar: 'ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', tr: 'Allāhumma ṣalli ʿalā Muḥammad', gs: 'O God, send blessings upon Muhammad' };
const COUNTER = { big: 'Counter', tr: '', gs: 'A plain count to one hundred' };

// what the hundredth (or the target) shows: one natural phrase per line
const DONE = {
  // the formula for completing the hundred after the prayer, as reported in Ṣaḥīḥ Muslim
  tahlil: {
    eyebrow: 'The hundredth',
    ar: ['لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ،', 'لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ،', 'وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ'],
    tr: ['Lā ilāha illa-llāhu waḥdahu lā sharīka lah,', 'lahu-l-mulku wa lahu-l-ḥamdu, wa huwa ʿalā kulli shayʾin qadīr.'],
    gs: 'There is no god but God alone, without partner. His is the dominion and His is the praise, and He has power over all things.',
  },
  takbir34: {
    eyebrow: 'The hundredth',
    ar: ['ٱللَّٰهُ أَكْبَرُ'], tr: ['Allāhu akbar.'],
    gs: 'God is the greatest: the thirty-fourth, completing the hundred.',
  },
  istighfar: {
    eyebrow: 'The hundredth',
    ar: ['أَسْتَغْفِرُ ٱللَّٰهَ وَأَتُوبُ إِلَيْهِ'], tr: ['Astaghfiru-llāha wa atūbu ilayh.'],
    gs: 'I seek God’s forgiveness and turn to Him in repentance.',
  },
  salawat: {
    eyebrow: 'The hundredth',
    ar: ['ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', 'وَعَلَىٰ آلِ مُحَمَّدٍ'], tr: ['Allāhumma ṣalli ʿalā Muḥammadin', 'wa ʿalā āli Muḥammad.'],
    gs: 'O God, send blessings upon Muhammad and upon the family of Muhammad.',
  },
  counter: { eyebrow: 'One hundred', big: 'One hundred', tr: [], gs: 'The count is complete.' },
};

// blocks: [how many, phrase] in order; the set is complete at `target`
export const PRESETS = {
  tasbih: { name: 'Tasbīḥ after prayer', detail: '33 · 33 · 33, then the tahlīl', target: 100,
    blocks: [[33, SUBHAN], [33, HAMD], [33, AKBAR], [1, TAHLIL]], done: DONE.tahlil },
  tasbih34: { name: 'Tasbīḥ after prayer, 33 · 33 · 34', detail: 'the hundredth is a thirty-fourth takbīr', target: 100,
    blocks: [[33, SUBHAN], [33, HAMD], [34, AKBAR]], done: DONE.takbir34 },
  istighfar: { name: 'Istighfār', detail: 'one hundred times', target: 100, blocks: [[100, ISTIGHFAR]], done: DONE.istighfar },
  salawat: { name: 'Ṣalawāt', detail: 'one hundred times', target: 100, blocks: [[100, SALAWAT]], done: DONE.salawat },
  counter: { name: 'Counter', detail: 'a plain count to one hundred', target: 100, blocks: [[100, COUNTER]], done: DONE.counter },
};
export const ORDER = ['tasbih', 'tasbih34', 'istighfar', 'salawat', 'counter', 'custom'];

export const MAX_TARGET = 9999;
const isArabic = s => /[؀-ۿݐ-ݿ]/.test(s);
// a custom set: one phrase (Arabic script shows in the Arabic line), a meaning, a target
function customPreset(c) {
  const phrase = isArabic(c.phrase) ? { ar: c.phrase, tr: '', gs: c.meaning } : { big: c.phrase, tr: '', gs: c.meaning };
  return {
    name: c.phrase, detail: `${c.target} times`, target: c.target, blocks: [[c.target, phrase]],
    done: { eyebrow: 'Complete', ...(phrase.ar ? { ar: [c.phrase] } : { big: c.phrase }), tr: [], gs: c.meaning ? `${c.meaning}: ${c.target} times.` : `${c.target} times.` },
  };
}
export const preset = (key, custom) => key === 'custom' ? customPreset(custom) : PRESETS[key];

// what to show at a count: the phrase, the number in its block, the totals, the moments
export function view(p, count) {
  let start = 0, b = 0;
  if (count > 0) for (; b < p.blocks.length - 1; b++) { if (count <= start + p.blocks[b][0]) break; start += p.blocks[b][0]; }
  const [n, phrase] = p.blocks[b], inBlock = count - start, single = n === 1;
  return {
    phrase, phraseKey: `${p.name}:${b}`,
    number: single ? count : inBlock,
    of: single ? '' : `/ ${n}`,
    spoken: single ? `${count}: ${phrase.tr || phrase.big}` : `${inBlock} of ${n}`,
    total: `${count} of ${p.target}`,
    complete: count >= p.target,
    // the end of a block before the last (33 and 66): the gentle bell
    blockEnd: !single && inBlock === n && b < p.blocks.length - 1 && p.blocks[b + 1][0] > 1,
  };
}

// ── progress, saved on this device ──
const KEY = 'misbaha.dhikr';
const DEFAULT = { current: 'tasbih', progress: {}, custom: { phrase: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ', meaning: 'Glory be to God, and praise be to Him', target: 100 } };
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s !== 'object') return structuredClone(DEFAULT);
    const out = structuredClone(DEFAULT);
    if (ORDER.includes(s.current)) out.current = s.current;
    if (s.custom && typeof s.custom.phrase === 'string' && s.custom.phrase.trim()) {
      out.custom = { phrase: s.custom.phrase.slice(0, 80), meaning: String(s.custom.meaning || '').slice(0, 120), target: clampTarget(s.custom.target) };
    }
    for (const k of ORDER) {
      const p = s.progress?.[k];
      if (p && Number.isInteger(p.count) && Number.isInteger(p.round)) out.progress[k] = { count: Math.max(0, p.count), round: Math.max(1, p.round) };
    }
    return out;
  } catch (e) { return structuredClone(DEFAULT); }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export const clampTarget = t => Math.max(1, Math.min(MAX_TARGET, Math.round(Number(t)) || 100));
export const progressOf = (state, key) => state.progress[key] || { count: 0, round: 1 };
