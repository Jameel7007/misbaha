// The dhikr sets: what shows at each count, when the bells and the end come, and how saved
// progress survives bad data. Run: npm test
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const D = await import('../src/dhikr.js');

test('after-prayer tasbīḥ: three thirty-threes, bells at 33 and 66, complete at 100', () => {
  const p = D.preset('tasbih');
  assert.equal(D.view(p, 1).phrase.tr, 'Subḥāna-llāh');
  assert.equal(D.view(p, 33).number, 33);
  assert.equal(D.view(p, 33).blockEnd, true);
  assert.equal(D.view(p, 34).phrase.tr, 'Al-ḥamdu li-llāh');
  assert.equal(D.view(p, 34).number, 1);
  assert.equal(D.view(p, 66).blockEnd, true);
  assert.equal(D.view(p, 99).blockEnd, false, 'no bell before the tahlīl: the hundredth is the moment');
  assert.equal(D.view(p, 99).complete, false);
  assert.equal(D.view(p, 100).complete, true);
  assert.equal(D.view(p, 100).phrase.tr.startsWith('Lā ilāha'), true);
});

test('the 33 · 33 · 34 tasbīḥ ends on a thirty-fourth takbīr', () => {
  const p = D.preset('tasbih34'), v = D.view(p, 100);
  assert.equal(v.phrase.tr, 'Allāhu akbar');
  assert.equal(v.number, 34);
  assert.equal(v.complete, true);
});

test('a custom set counts to its own target', () => {
  const p = D.preset('custom', { phrase: 'Yā Laṭīf', meaning: 'O Subtle One', target: 129 });
  assert.equal(D.view(p, 128).complete, false);
  assert.equal(D.view(p, 129).complete, true);
  assert.equal(D.view(p, 5).phrase.big, 'Yā Laṭīf', 'a Latin-script phrase takes the big line');
});

test('targets are clamped to 1–9999', () => {
  assert.equal(D.clampTarget(0), 100);
  assert.equal(D.clampTarget(-5), 1);
  assert.equal(D.clampTarget(123456), 9999);
  assert.equal(D.clampTarget('33'), 33);
});

beforeEach(() => store.clear());
test('saved progress round-trips', () => {
  const s = D.load();
  s.current = 'istighfar'; s.progress.istighfar = { count: 41, round: 2 };
  D.save(s);
  const t = D.load();
  assert.equal(t.current, 'istighfar');
  assert.deepEqual(D.progressOf(t, 'istighfar'), { count: 41, round: 2 });
});

test('corrupt or hostile saved data falls back safely', () => {
  for (const bad of ['not json', '[]', '{"current":"nope","progress":{"tasbih":{"count":"x","round":1}}}', '{"custom":{"phrase":"","target":5}}']) {
    store.set('misbaha.dhikr', bad);
    const s = D.load();
    assert.ok(D.ORDER.includes(s.current));
    assert.deepEqual(D.progressOf(s, 'tasbih'), { count: 0, round: 1 });
    assert.ok(s.custom.phrase.length > 0);
  }
  store.set('misbaha.dhikr', JSON.stringify({ custom: { phrase: 'x'.repeat(500), target: 1e9 } }));
  const s = D.load();
  assert.equal(s.custom.phrase.length, 80);
  assert.equal(s.custom.target, 9999);
});
