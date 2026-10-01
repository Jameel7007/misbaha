// Measures the palette as it actually reaches the screen, under the lamp, tone mapping
// and all, and checks the rendered colours against the same rules as the targets.
// Needs the dev server running. Run: npm run verify:colour
import { FLOOR, FLOOR_HEX, HAND, HAND_HEX, LAMP_KELVIN, RUG, RUG_HEX, TILE_HEX, WALL, deltaE, labToLch, lchToLab } from '../src/palette.js';
import { checkRules } from './lib/rules.mjs';
import { GROUPS, beadColour, launch, open, peakLightness, probePoint, surfaceColours } from './lib/render.mjs';
import { RULES } from '../src/palette.js';

const SETS = { rug: [RUG, RUG_HEX], floor: [FLOOR, { floor: FLOOR_HEX }], wall: [WALL, TILE_HEX], hand: [HAND, { stone: HAND_HEX }] };
const browser = await launch();

const beads = { hold: {}, count: {} };
for (const variety of ['amber', 'olive', 'ebony']) for (const view of ['hold', 'count']) {
  const page = await open(browser, variety, view);
  const m = await beadColour(page);
  beads[view][variety] = { ...labToLch(m.lab), Lhi: m.Lhi };
  await page.close();
}
const f = c => `L ${c.L.toFixed(2)}  C ${c.C.toFixed(3)}  h ${c.h.toFixed(0).padStart(3)}` + (c.Lhi ? `  lit ${c.Lhi.toFixed(2)}` : '');
console.log('beads as rendered      Hold (on the rug)             Count (against the wall)');
for (const v of ['amber', 'olive', 'ebony']) console.log(`  ${v.padEnd(18)}  ${f(beads.hold[v])}   ${f(beads.count[v])}`);

// no hotspot anywhere in the room may outshine the beads' lit faces
const peaks = {};
for (const view of ['hold', 'count']) { const page = await open(browser, 'amber', view); peaks[view] = await peakLightness(page); await page.close(); }

const groups = [];
let worstResidual = 0;
for (const g of GROUPS) {
  const [targets, hexes] = SETS[g.name];
  const page = await open(browser, 'amber', g.view);
  const seen = await surfaceColours(page, g.surface, hexes, await probePoint(page, g.surface));
  await page.close();
  console.log(`\n${g.title}: daylight material → rendered under the lamp (ΔE shift)`);
  const colours = {};
  for (const [k, lab] of Object.entries(seen)) {
    const r = labToLch(lab), t = targets[k], e = deltaE(lab, lchToLab(t));
    worstResidual = Math.max(worstResidual, e);
    colours[k] = { ...r, role: t.role };
    console.log(`  ${k.padEnd(12)} ${f(t)}  →  ${f(r)}   (${e.toFixed(3)})`);
  }
  groups.push({ title: g.title, view: g.view, colours });
}
await browser.close();

console.log(`\nlamp ${LAMP_KELVIN} K; largest shift from daylight: ΔE ${worstResidual.toFixed(3)}`);
const failures = checkRules(groups, beads, true);
for (const [view, peak] of Object.entries(peaks)) {
  const cap = beads[view].amber.Lhi - RULES.valueMargin;
  console.log(`brightest 0.1% of the room (${view}): L ${peak.toFixed(2)}; must stay ≤ ${cap.toFixed(2)} (amber's lit faces − margin)`);
  if (peak > cap) failures.push(`${view}: the room's brightest pixels (L ${peak.toFixed(2)}) outshine the beads' lit faces`);
}
for (const m of failures) console.log('  FAIL ' + m);
console.log(failures.length ? `\n${failures.length} rendered check(s) failed` : '\nall rendered checks pass');
process.exit(failures.length ? 1 : 0);
