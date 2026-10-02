// The room's colours.
//
// Every colour here is a MATERIAL colour: how the dyed wool, glaze or stone looks in
// daylight. The craft tradition specifies exactly this, so the values stay true to it.
// The lamp's colour is a colour temperature in kelvin, like a real bulb, and it is
// calibrated as a camera's white balance would be: `npm run calibrate:colour` finds the
// temperature at which undyed ivory wool reads as ivory with only a trace of warmth,
// instead of turning the whole room orange.
//
// The rules are checked twice: on these daylight colours (`npm run check:palette`) and on
// the colours that actually reach the screen under the lamp (`npm run verify:colour`).
//
// Colours are in OKLCH, a perceptual colour space: L is lightness (0 black … 1 white),
// C is chroma (0 grey … ~0.37 most vivid), h is hue angle in degrees. Equal numeric steps
// look roughly equally different, which is what makes the rules measurable.
//
// Sources: the rug uses the natural dyes of Persian and Anatolian carpets; green (Paradise)
// is made the way dyers made it, indigo overdyed with weld; the wall uses the cobalt and
// turquoise glazes of Ilkhanid Kashan star-and-cross tilework. Hues describe how the dyed
// wool or glaze typically looks; they are approximations from the crafts, not spectral
// measurements.
import { LAMP_KELVIN } from './palette.calibrated.js';

// ── rules ──
export const RULES = {
  neutralC: 0.04,        // below this chroma a colour reads as near-neutral; hue rules skip it
  hueClearance: 15,      // coloured ground keeps this many degrees from the beads' hues
  figureGroundDE: 0.10,  // every *area* colour differs from every bead colour by ΔE_OK ≥ this
  neighbourDE: 0.08,     // colours that touch in a pattern stay distinct
  fieldMaxL: 0.42,       // a dark field …
  borderStep: 0.15,      // … and a border at least this much lighter
  // under the lamp only (they describe the lit scene's hierarchy):
  chromaBelowBeads: 0.85,// ground chroma ≤ this × the least saturated of amber and olive: the beads lead
  valueMargin: 0.04,     // *area* colours keep this far from ebony's typical tone (either side) and below amber's lit faces
};
// Roles: 'area' colours are large surfaces a bead lies on or hangs in front of; they decide
// figure against ground. 'accent' and 'line' colours are small or thin: they still obey the
// hue, chroma and neighbour rules, but can't swallow a bead (and near-black ebony is always
// close to a dark outline, which is harmless). A 'carving' (the hand) is an object the strand
// passes over and hangs in front of: it is checked against the beads' lit faces (rules.mjs).

// ── materials, in daylight ──
export const RUG = {
  madder:      { L: 0.42, C: 0.058, h: 16,  role: 'area',   note: 'madder root on alum, toward crimson: the rosette petals, most of the field' },
  indigo:      { L: 0.33, C: 0.075, h: 262, role: 'area',   note: 'indigo vat: the eight-point stars' },
  weld:        { L: 0.56, C: 0.072, h: 106, role: 'accent', note: 'weld on alum: a cool, greenish yellow, well clear of amber' },
  green:       { L: 0.44, C: 0.075, h: 158, role: 'accent', note: 'indigo overdyed with weld: green for Paradise, at the heart of each star' },
  greyWool:    { L: 0.52, C: 0.0,   h: 0,   role: 'line',   note: 'natural grey wool: the strapwork bands (undyed camel drifts into the beads\' own brown under a warm lamp)' },
  walnut:      { L: 0.24, C: 0.025, h: 55,  role: 'line',   note: 'walnut hull: dark brown outlines' },
  skyIndigo:   { L: 0.58, C: 0.045, h: 245, role: 'area',   note: 'a pale indigo bath: the lighter border ground, opposite amber on the wheel' },
  pomegranate: { L: 0.48, C: 0.055, h: 108, role: 'accent', note: 'pomegranate rind on alum: greenish khaki, the outer guard' },
  madderPale:  { L: 0.46, C: 0.055, h: 22,  role: 'accent', note: 'a lighter madder bath: border lozenges and inner guard' },
};
// the white-balance reference: not used in the patterns, it's the "grey card" the lamp is
// calibrated against (undyed wool is the natural neutral of a wool rug)
export const WHITE_REF = { L: 0.62, C: 0.025, h: 90, note: 'undyed ivory wool' };
export const FLOOR = { floor: { L: 0.44, C: 0.02, h: 240, role: 'area', note: 'cool slate beyond the rug, so a dark bead dropped off it still shows' } };
export const WALL = {
  cobalt:    { L: 0.40, C: 0.092, h: 266, role: 'area',   note: 'cobalt glaze: the stars' },
  turquoise: { L: 0.50, C: 0.06,  h: 208, role: 'area',   note: 'copper turquoise glaze, a deep one: the crosses' },
  tinWhite:  { L: 0.78, C: 0.015, h: 90,  role: 'accent', note: 'tin-opacified white: small rosettes' },
  grout:     { L: 0.20, C: 0.01,  h: 60,  role: 'line',   note: 'joints between tiles' },
};

// the hand: carved from nephrite jade, the deep spinach green of classic jade carving, so it
// implies no particular skin tone. Green is the colour of Paradise (Stage 1's palette), and
// jade's hue sits far from the beads' amber; kept darker and less saturated than the beads
// so they stay the brightest, most saturated thing in the lamp
export const HAND = { jade: { L: 0.38, C: 0.055, h: 155, role: 'carving', note: 'nephrite jade: the carved hand holding the strand' } };

// Waivers: a rule failure accepted on purpose, with the reason. The checks print each one
// on every run instead of failing, so it stays visible.
export const WAIVERS = [
  { colour: 'jade', bead: 'ebony', rule: 'figure-ground',
    reason: 'the owner chose this nephrite by eye; an ebony bead reads against it by hue (brown on green) though their lit faces are ΔE ≈ 0.08 apart. Moving the jade far enough to pass turns it teal or makes its lamp-lit top outshine the beads.' },
];

// colours that touch each other in the patterns (for the neighbour rule)
export const NEIGHBOURS = [
  ['madder', 'indigo'], ['madder', 'weld'], ['indigo', 'green'], ['madder', 'greyWool'], ['indigo', 'greyWool'],
  ['greyWool', 'walnut'], ['skyIndigo', 'indigo'], ['skyIndigo', 'green'], ['skyIndigo', 'pomegranate'], ['skyIndigo', 'madderPale'],
  ['cobalt', 'turquoise'], ['cobalt', 'tinWhite'], ['turquoise', 'grout'], ['cobalt', 'grout'],
];

// ── the lamp ──
export { LAMP_KELVIN };
// black-body colour of a temperature (Tanner Helland's fit), as a hex string
export function kelvinToHex(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}
export const LAMP_HEX = kelvinToHex(LAMP_KELVIN);

// ── conversions (Björn Ottosson's OKLab) ──
export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
export const lchToLab = ({ L, C, h }) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
export const labToLch = ([L, a, b]) => ({ L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 });
export const inGamut = lab => oklabToLinear(lab).every(v => v >= -1e-4 && v <= 1 + 1e-4);
const toSrgb = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
export const labToHex = lab => '#' + oklabToLinear(lab).map(v => Math.round(toSrgb(v) * 255).toString(16).padStart(2, '0')).join('');
export function hexToLab(h) {
  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// hex strings for the drawing code
const hexes = set => Object.fromEntries(Object.entries(set).map(([k, c]) => [k, labToHex(lchToLab(c))]));
export const RUG_HEX = hexes(RUG);
export const TILE_HEX = hexes(WALL);
export const FLOOR_HEX = hexes(FLOOR).floor;
export const HAND_HEX = hexes(HAND).jade;
