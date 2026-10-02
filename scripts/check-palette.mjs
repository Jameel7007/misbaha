// Checks the daylight material colours (src/palette.js) against the palette rules, using the
// beads' own material colours. No browser needed. Run: npm run check:palette
// The lit scene is checked separately by npm run verify:colour.
import { FLOOR, ROD, RUG, RULES, WALL, hexToLab, labToHex, labToLch, lchToLab } from '../src/palette.js';
import { VARIETIES } from '../src/strand.js';
import { checkRules } from './lib/rules.mjs';

const groups = [
  { title: 'rug', view: 'daylight', colours: RUG },
  { title: 'floor', view: 'daylight', colours: FLOOR },
  { title: 'wall', view: 'daylight', colours: WALL },
  { title: 'rod', view: 'daylight', colours: ROD },
];
// each bead's colour is its material's dark tone blended toward the light one by
// 0.25 + 0.75 × a random tone (strand.js), in linear RGB: 0.625 on average. The typical
// bead is what the render check measures too (the median bead pixel).
const lin = h => [1, 3, 5].map(i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
const toHex = rgb => '#' + rgb.map(v => Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, '0')).join('');
const typical = v => { const a = lin(v.a), b = lin(v.b); return toHex(a.map((x, i) => x + (b[i] - x) * 0.625)); };
const beads = { daylight: Object.fromEntries(Object.entries(VARIETIES).map(([k, v]) => [k, labToLch(hexToLab(typical(v)))])) };

for (const g of groups) {
  console.log(`\n${g.title}: material colour in daylight`);
  for (const [k, c] of Object.entries(g.colours)) console.log(`  ${k.padEnd(12)} L ${c.L.toFixed(2)}  C ${c.C.toFixed(3)}  h ${String(c.h).padStart(3)}  ${c.role.padEnd(6)} ${labToHex(lchToLab(c))}  ${c.note}`);
}
console.log('\nbeads, daylight:', Object.entries(beads.daylight).map(([k, c]) => `${k} L ${c.L.toFixed(2)} C ${c.C.toFixed(3)} h ${c.h.toFixed(0)}`).join(' · '));
console.log('rules:', Object.entries(RULES).map(([k, v]) => `${k} ${v}`).join(', '));
const failures = checkRules(groups, beads, false);
for (const f of failures) console.log('  FAIL ' + f);
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall daylight checks pass');
process.exit(failures.length ? 1 : 0);
