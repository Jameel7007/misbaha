// The palette rules, applied either to the daylight material colours (check:palette) or to
// the colours that reach the screen under the lamp (verify:colour). Colours are OKLCH.
import { NEIGHBOURS, RULES, WAIVERS, deltaE, inGamut, lchToLab } from '../../src/palette.js';

const hueGap = (h, lo, hi) => (h >= lo && h <= hi) ? 0 : Math.min(...[lo, hi].map(b => Math.min(Math.abs(h - b), 360 - Math.abs(h - b))));

// groups: [{ view, colours: {key: {L, C, h, role}} }]
// beads:  {view: {name: {L, C, h}}}  (names include amber, olive and ebony when lit)
// lit:    true under the lamp, which adds the lit-scene hierarchy rules
export function checkRules(groups, beads, lit) {
  const failures = [];
  const fail = m => failures.push(m);
  const all = Object.assign({}, ...groups.map(g => g.colours));

  for (const g of groups) {
    const b = beads[g.view], list = Object.values(b);
    const beadHues = [Math.min(...list.map(c => c.h)), Math.max(...list.map(c => c.h))];
    for (const [k, c] of Object.entries(g.colours)) {
      if (!lit && !inGamut(lchToLab(c))) fail(`${k}: outside the sRGB gamut`);
      if (c.C >= RULES.neutralC && hueGap(c.h, ...beadHues) < RULES.hueClearance) fail(`${k}: hue ${c.h.toFixed(0)}° is within ${RULES.hueClearance}° of the bead hues ${beadHues.map(h => h.toFixed(0)).join('–')}°`);
      if (lit) {
        const cap = RULES.chromaBelowBeads * Math.min(b.amber.C, b.olive.C);
        if (c.C > cap) fail(`${k}: chroma ${c.C.toFixed(3)} > ${cap.toFixed(3)} (the beads must be the most saturated thing)`);
      }
      // a carving (the hand) is an object, not a ground: beads don't lie on it, they pass over
      // its finger and hang in front of it. A dark stone and dark ebony share a tone, and any
      // polished surface right under the lamp reflects enough of it to set a floor on how
      // dark it can render (about L 0.21 here), so an ebony bead reads against the carving
      // by its lit side and its shine: the carving is checked against each bead's lit face,
      // and must stay below amber's
      if (c.role === 'carving') {
        if (lit && c.L > b.amber.Lhi - RULES.valueMargin) fail(`${k}: lightness ${c.L.toFixed(2)} is above lit amber ${b.amber.Lhi.toFixed(2)} − ${RULES.valueMargin}`);
        for (const [v, bc] of Object.entries(b)) {
          const e = deltaE(lchToLab(c), lchToLab(lit && bc.Lhi ? { ...bc, L: bc.Lhi } : bc));
          if (e >= RULES.figureGroundDE) continue;
          const msg = `${k} vs ${v} beads${lit ? ' (lit face)' : ''}: ΔE ${e.toFixed(3)} < ${RULES.figureGroundDE}`;
          const w = WAIVERS.find(w => w.colour === k && w.bead === v && w.rule === 'figure-ground');
          if (w) console.log(`  WAIVED ${msg}: ${w.reason}`); else fail(msg);
        }
        continue;
      }
      if (c.role !== 'area') continue;
      // clear of dark ebony's typical tone (lighter or darker, by the margin) and below amber's
      // lit faces: a hanging strand is judged by its lit side; its shadowed undersides are
      // part of any hanging object
      if (lit && (Math.abs(c.L - b.ebony.L) < RULES.valueMargin || c.L > b.amber.Lhi - RULES.valueMargin)) fail(`${k}: lightness ${c.L.toFixed(2)} is within ${RULES.valueMargin} of ebony ${b.ebony.L.toFixed(2)}, or above lit amber ${b.amber.Lhi.toFixed(2)} − ${RULES.valueMargin}`);
      for (const [v, bc] of Object.entries(b)) { const e = deltaE(lchToLab(c), lchToLab(bc)); if (e < RULES.figureGroundDE) fail(`${k} vs ${v} beads: ΔE ${e.toFixed(3)} < ${RULES.figureGroundDE}`); }
    }
  }
  const fieldL = Math.max(all.madder.L, all.indigo.L);
  if (fieldL > RULES.fieldMaxL) fail(`field lightness ${fieldL.toFixed(2)} > ${RULES.fieldMaxL} (the field must be dark)`);
  if (all.skyIndigo.L - fieldL < RULES.borderStep) fail(`border is only ${(all.skyIndigo.L - fieldL).toFixed(2)} lighter than the field (needs ${RULES.borderStep})`);
  for (const [p, q] of NEIGHBOURS) { const e = deltaE(lchToLab(all[p]), lchToLab(all[q])); if (e < RULES.neighbourDE) fail(`${p} vs ${q} (touching): ΔE ${e.toFixed(3)} < ${RULES.neighbourDE}`); }
  return failures;
}
