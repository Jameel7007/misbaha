// A right hand carved from dark stone, holding the strand over its index finger.
// Only the index finger is physical (a capsule collider in physics.js); the rest of the hand
// is visual. The thumb rests behind the current bead and, while a bead passes over the
// finger, its tip follows just behind that bead (two-bone inverse kinematics), so every
// count shows the thumb pulling a bead over.
//
// The hand is one carved form: fingers, fist, palm, wrist and forearm are rounded pieces
// blended into each other with fillets (a distance field, meshed once at load by
// sdf-mesh.js). The thumb moves, so it is three smooth pieces of its own. The forearm darkens
// as it reaches back, so the hand comes out of the dark instead of ending at a cut.
//
// Local frame: the index finger's tip is at the origin and the finger runs back along -z;
// +y is up, +x faces the camera (the back of the hand). The whole group follows the finger
// (sim.pegEnd), so in Hold mode the hand slides back with it.
import { BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { HAND_HEX } from './palette.js';
import { PEG, PEG_R, X, sim } from './physics.js';
import { coneSphere, ellipsoid, meshSDF, roundCone, union } from './sdf-mesh.js';

const UP = new Vector3(0, 1, 0);

// stone grain: a faint, slow mottling of the colour and the polish, fixed to the hand (not
// the world) so it doesn't swim when the hand moves
const GRAIN = {
  vertex: ['#include <common>', '#include <common>\nuniform mat4 uHandInv;\nvarying vec3 vStone;', '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStone = (uHandInv * modelMatrix * vec4(transformed, 1.0)).xyz;'],
  fragment: `
    varying vec3 vStone;
    float stoneHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float stoneNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(stoneHash(i), stoneHash(i + vec3(1, 0, 0)), f.x), mix(stoneHash(i + vec3(0, 1, 0)), stoneHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(stoneHash(i + vec3(0, 0, 1)), stoneHash(i + vec3(1, 0, 1)), f.x), mix(stoneHash(i + vec3(0, 1, 1)), stoneHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }`,
};

export function createHand(scene) {
  // a dark, honed stone: a soft sheen where the lamp catches the knuckles, never a mirror
  const material = new MeshStandardMaterial({ color: HAND_HEX, roughness: 0.4, metalness: 0, vertexColors: true });
  const uHandInv = { value: new Matrix4() };
  material.onBeforeCompile = shader => {
    shader.uniforms.uHandInv = uHandInv;
    const [a, b, c, d] = GRAIN.vertex;
    shader.vertexShader = shader.vertexShader.replace(a, b).replace(c, d);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + GRAIN.fragment)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = 0.65 * stoneNoise(vStone * 9.0) + 0.35 * stoneNoise(vStone * 31.0);
        diffuseColor.rgb *= 0.86 + 0.28 * grain;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (0.5 - grain) * 0.16, 0.0, 1.0);`);
  };
  material.customProgramCacheKey = () => 'carved-stone';
  const group = new Group();
  scene.add(group);
  const add = m => { m.castShadow = true; group.add(m); return m; };
  const v = (x, y, z) => new Vector3(x, y, z);
  const A = p => [p.x, p.y, p.z];

  // ── the carved body: [shape, how far it fillets into the rest] ──
  const pieces = [];
  const cone = (a, b, ra, rb, k) => pieces.push([roundCone(A(a), A(b), ra, rb), k, coneSphere(A(a), A(b), ra, rb)]);
  const chain = (pts, radii, k) => { for (let i = 0; i < pts.length - 1; i++) cone(pts[i], pts[i + 1], radii[i], radii[i + 1], i === 0 ? k : 0.02); };
  // the palm, the mass of the fist, the wrist and the forearm reaching back and down out of the light
  pieces.push([ellipsoid([0, -0.27, -1.3], [0.11, 0.37, 0.42]), 0]);
  pieces.push([ellipsoid([-0.01, -0.42, -0.98], [0.1, 0.3, 0.17]), 0.09, [-0.01, -0.42, -0.98, 0.3]]);
  const wrist = v(0.01, -0.32, -1.72), forearm = v(0.03, -0.9, -2.0);
  cone(wrist, forearm, 0.15, 0.17, 0.12);   // the start of the forearm; the rest is meshed below
  // middle, ring and little fingers curled into a fist under the index finger: each a tight
  // hook (forward, down, back into the palm), close enough to touch, kept behind the strand.
  // Small fillets between them, so they stay three fingers with a groove between.
  const curl = (y, z, r) => chain(
    [v(0, y, z), v(0, y - 0.05, z + 0.21), v(0, y - 0.21, z + 0.2), v(-0.01, y - 0.27, z + 0.04)],
    [r * 1.05, r, r * 0.95, r * 0.85], 0.07);
  curl(-0.15, -0.95, 0.08);
  curl(-0.3, -1.0, 0.077);
  curl(-0.44, -1.06, 0.068);
  // the index finger, extended: tip at the origin (matches the collider's radius)
  chain([v(0, 0, -PEG_R), v(0, 0, -0.27), v(0, 0, -0.53), v(0, -0.01, -0.9)], [PEG_R * 0.92, PEG_R * 0.96, PEG_R, PEG_R * 1.06], 0.02);
  cone(v(0, -0.01, -0.9), v(0, -0.12, -1.12), PEG_R * 1.06, 0.1, 0.08);
  // the thumb's fixed root on the side of the palm
  const thumbBase = v(0.07, -0.06, -1.36), thumbRoot = v(0.08, 0.1, -1.0);
  cone(thumbBase, thumbRoot, 0.085, 0.08, 0.07);
  const body = add(new Mesh(meshSDF(union(pieces), [[-0.24, 0.3], [-1.12, 0.16], [-2.12, 0.03]], 0.014), material));
  // the rest of the arm, out of the light, so meshed coarser: the forearm hangs down and back
  // from the raised hand to the elbow, below the bottom of the picture, and the upper arm
  // goes back into the dark behind the wall. A touch thinner than the fine mesh where the two overlap, so
  // the fine one shows there.
  const elbow = v(0.08, -4.3, -3.0);
  const arm = add(new Mesh(meshSDF(union([
    [roundCone(A(wrist), A(elbow), 0.145, 0.19), 0],
    [roundCone(A(elbow), [0.12, -4.9, -4.6], 0.19, 0.2), 0.05],
  ]), [[-0.2, 0.36], [-5.15, -0.15], [-4.85, -1.55]], 0.035), material));
  // the colour falls off with distance from the knuckles, so the arm fades into the dark
  for (const m of [body, arm]) {
    const P = m.geometry.attributes.position, C = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const dist = Math.hypot(P.getX(i), P.getY(i) + 0.35, P.getZ(i) + 1.25);
      const t = Math.min(1, Math.max(0, (1.45 - dist) / 0.75)), f = 0.04 + 0.96 * t * t * (3 - 2 * t);
      C[3 * i] = C[3 * i + 1] = C[3 * i + 2] = f;
    }
    m.geometry.setAttribute('color', new BufferAttribute(C, 3));
  }

  // ── the thumb: two rigid carved bones and a knuckle, moved by IK ──
  const L1 = 0.27, L2 = 0.24, R1 = 0.07, R2 = 0.06;
  const white = g => { const n = g.attributes.position.count; g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3)); return g; };
  const bone = (len, ra, rb) => white(meshSDF(roundCone([0, 0, 0], [0, len, 0], ra, rb), [[-ra, ra], [-ra, len + rb], [-ra, ra]], 0.008));
  const bone1 = add(new Mesh(bone(L1, R1, R1), material)), bone2 = add(new Mesh(bone(L2, R1, R2), material));
  const knuckle = add(new Mesh(white(new SphereGeometry(R1, 24, 16)), material));
  const tip = new Mesh(); group.add(tip);   // the thumb tip's position (read by the dev measurements)
  // at rest the thumb tip sits on top of the finger, just behind the bead resting there
  const REST = v(0.035, PEG_R + 0.06, -0.5);
  const target = REST.clone(), want = new Vector3(), mid = new Vector3(), pole = new Vector3(1, 0.35, 0).normalize();   // the thumb's knuckle bends outward, not up
  const q = new Quaternion(), d = new Vector3();
  function placeRigid(mesh, a, b) { mesh.position.copy(a); mesh.quaternion.copy(q.setFromUnitVectors(UP, d.subVectors(b, a).normalize())); }

  // two-bone IK: the knee goes where the two lengths meet, bent toward the pole direction
  function solveThumb(t) {
    const dir = d.subVectors(t, thumbRoot);
    let dist = dir.length();
    dist = Math.min(dist, L1 + L2 - 1e-3);
    dir.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    mid.copy(thumbRoot).addScaledVector(dir, a).addScaledVector(bend, h);
    const end = thumbRoot.clone().addScaledVector(dir, dist);
    placeRigid(bone1, thumbRoot, mid); placeRigid(bone2, mid, end);
    knuckle.position.copy(mid); tip.position.copy(end);
  }

  // the stroke: while a bead travels, the thumb rides just behind it, pressing slightly
  // forward; when it has passed, the thumb lifts and settles back to rest
  let lift = 0;
  return {
    material,
    group,
    body,   // the carved hand without the arm (what the camera frames on phones)
    tip,   // the thumb tip mesh (read by the dev measurements)
    // following: index of the bead travelling over the finger, or -1 when none is
    update(dt, following) {
      group.position.set(PEG.x, PEG.y, sim.pegEnd);
      if (following >= 0) {
        const k = 3 * following;
        want.set(X[k] - PEG.x, X[k + 1] - PEG.y, X[k + 2] - sim.pegEnd);
        want.x *= 1.2; want.y *= 1.2; want.z -= 0.1;
        lift = 1;
      } else {
        // follow-through: once the bead is over, the thumb carries on a little forward and
        // lifts clear, then settles back to rest
        want.copy(REST);
        want.y += 0.17 * lift; want.z += 0.1 * lift;
        lift *= Math.exp(-dt / 0.14);
      }
      const tau = following >= 0 ? 0.02 : 0.08;   // tight while pulling, unhurried on the way back
      target.lerp(want, 1 - Math.exp(-dt / tau));
      solveThumb(target);
      group.updateMatrixWorld(); uHandInv.value.copy(group.matrixWorld).invert();
    },
  };
}
