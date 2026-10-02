// The rod the strand hangs from: a lathe-turned rod coming out of the tiled wall, with a
// finial at its tip, and where it enters the wall a turned collar on an eight-pointed star
// rosette (the khatam of the wall's own tilework). In Drop mode the rod slides back into the
// wall through its collar and the strand falls; the collar and rosette stay on the wall.
//
// Only the shaft is physical: a capsule from the wall to sim.pegEnd (physics.js). The finial
// is visual, beyond the end of the capsule, past where the beads hang.
//
// The finish is walnut with mother-of-pearl inlay, as in Damascene woodwork: a dark turned
// wood with a grain running along the rod, bands of nacre near the tip, a nacre ring on the
// collar and a nacre star laid into the rosette. (Brass, and jade with brass, were tried
// side by side; STYLES keeps them for comparison, ?rod=brass or ?rod=jade in development.)
import {
  CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Shape, Vector2,
} from 'three';
import { addFill } from './fill.js';
import { ROD_HEX } from './palette.js';
import { PEG, PEG_R, WALL_Z, sim } from './physics.js';

const brass = () => new MeshStandardMaterial({ color: '#c9a24f', metalness: 1, roughness: 0.28 });
// walnut grain: long, uneven streaks along the rod's axis (z in each part's own frame), with
// a few darker lines, so the wood reads as turned timber rather than paint
const GRAIN = `
  float grainHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float grainNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(grainHash(i), grainHash(i + vec3(1, 0, 0)), f.x), mix(grainHash(i + vec3(0, 1, 0)), grainHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(grainHash(i + vec3(0, 0, 1)), grainHash(i + vec3(1, 0, 1)), f.x), mix(grainHash(i + vec3(0, 1, 1)), grainHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;
function walnut() {
  const m = new MeshPhysicalMaterial({ color: ROD_HEX.walnut, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrain;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrain = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrain;' + GRAIN)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float a = atan(vGrain.y, vGrain.x);
        float streak = grainNoise(vec3(cos(a) * 9.0, sin(a) * 9.0, vGrain.z * 1.2)) * 0.7 + grainNoise(vec3(cos(a) * 30.0, sin(a) * 30.0, vGrain.z * 3.0)) * 0.3;
        float line = smoothstep(0.62, 0.7, grainNoise(vec3(cos(a) * 22.0, sin(a) * 22.0, vGrain.z * 0.8)));
        diffuseColor.rgb *= (0.78 + 0.42 * streak) * (1.0 - 0.35 * line);`);
  };
  m.customProgramCacheKey = () => 'walnut-grain';
  return m;
}
const nacre = () => new MeshPhysicalMaterial({ color: ROD_HEX.nacre, roughness: 0.4, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [250, 650] });
export const STYLES = {
  // polished brass throughout, like the separators
  brass: () => { const b = brass(); return { shaft: b, fittings: b, bands: b }; },
  // walnut, turned, with mother-of-pearl inlay
  walnut: () => {
    const wood = walnut(), pearl = nacre();
    return { shaft: wood, fittings: wood, bands: pearl, fill: [wood, pearl] };
  },
  // nephrite jade with brass fittings
  jade: () => {
    const jade = new MeshStandardMaterial({ color: '#294b35', roughness: 0.28 });
    const b = brass();
    return { shaft: jade, fittings: b, bands: b, fill: [jade] };
  },
};

// a turned profile, [radius, length] pairs along the rod's axis, as a mesh along +z
function turned(points, segments = 48) {
  const g = new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segments);
  g.rotateX(Math.PI / 2);   // the lathe's axis (y) becomes the rod's (z)
  return g;
}
// an eight-pointed star (two squares, one turned 45°), as a plate facing +z
function starPlate(R, depth) {
  const s = new Shape();
  for (let i = 0; i < 16; i++) {   // alternate points (radius R) and the corners between them
    const a = i * Math.PI / 8 + Math.PI / 16, rr = i % 2 ? R * 0.72 : R;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 8 });
}

export function createRod(scene, style = 'walnut') {
  const group = new Group();
  scene.add(group);
  const m = STYLES[style]();
  for (const mat of m.fill || []) addFill(mat);
  const materials = [...new Set([m.shaft, m.fittings, m.bands])];
  const add = (geo, mat, parent = group) => { const o = new Mesh(geo, mat); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  // ── on the wall: the rosette and the collar the rod slides through ──
  const wall = new Group(); wall.position.set(PEG.x, PEG.y, WALL_Z); group.add(wall);
  add(starPlate(0.34, 0.02), m.fittings, wall);
  add(starPlate(0.22, 0.02), m.bands, wall).position.z = 0.02;   // the inlaid inner star
  add(turned([[0.125, 0], [0.129, 0.004], [0.129, 0.016], [0.125, 0.02]], 48), m.bands, wall).position.z = 0.075;   // a ring on the collar
  add(turned([[0.2, 0.0], [0.2, 0.03], [0.17, 0.05], [0.13, 0.06], [0.125, 0.09], [0.14, 0.11], [0.13, 0.13], [0.1, 0.15], [0.092, 0.24], [0.105, 0.27], [0.105, 0.3], [0.09, 0.32], [0.08, 0.33]]), m.fittings, wall);

  // ── the moving part: the shaft, its inlaid bands and the finial ──
  const moving = new Group(); moving.position.set(PEG.x, PEG.y, 0); group.add(moving);
  const shaftGeo = new CylinderGeometry(PEG_R, PEG_R, 1, 48, 1, true); shaftGeo.rotateX(Math.PI / 2); shaftGeo.translate(0, 0, -0.5);   // runs from z=0 back to z=-1
  const shaft = add(shaftGeo, m.shaft, moving);
  // inlaid bands near the tip (they move with the shaft), each a hair proud of it
  for (const [z, w] of [[-0.075, 0.012], [-0.115, 0.03], [-0.165, 0.012], [-0.5, 0.012], [-0.54, 0.03], [-0.59, 0.012]]) add(turned([[PEG_R, 0], [PEG_R + 0.003, 0.002], [PEG_R + 0.003, w - 0.002], [PEG_R, w]], 48), m.bands, moving).position.z = z;
  // the finial: a ring, a neck, an onion bulb and a spire, like a minaret's finial
  const finial = add(turned([[PEG_R, 0], [0.089, 0.008], [0.089, 0.03], [0.075, 0.042], [0.058, 0.06], [0.066, 0.075], [0.09, 0.105], [0.1, 0.14], [0.094, 0.175], [0.072, 0.205], [0.045, 0.23], [0.026, 0.255], [0.016, 0.29], [0.009, 0.33], [0.004, 0.355], [0, 0.365]], 48), m.fittings, moving);

  // the shaft runs from inside the wall to sim.pegEnd; hidden when it's all inside
  function update() {
    const len = sim.pegEnd - WALL_Z;
    moving.position.z = sim.pegEnd;
    shaft.scale.z = Math.max(0.001, len + 0.02);
    moving.visible = len > 0.02;
  }
  update();
  return { group, materials, subject: { finial, moving }, update };
}
