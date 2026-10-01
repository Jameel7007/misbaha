// A stylised, low-poly right hand holding the strand over its index finger.
// Only the index finger is physical (a capsule collider in physics.js); the rest of the hand
// is visual. The thumb rests behind the current bead and, while a bead passes over the
// finger, its tip follows just behind that bead (two-bone inverse kinematics), so every
// count shows the thumb pulling a bead over.
//
// Local frame: the index finger's tip is at the origin and the finger runs back along -z;
// +y is up, +x faces the camera (the back of the hand). The whole group follows the finger
// (sim.pegEnd), so in Hold mode the hand slides back with it.
import { CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { HAND_HEX } from './palette.js';
import { PEG, PEG_R, X, sim } from './physics.js';

const UP = new Vector3(0, 1, 0);

export function createHand(scene) {
  const material = new MeshStandardMaterial({ color: HAND_HEX, roughness: 0.85, metalness: 0, flatShading: true });
  const group = new Group();
  scene.add(group);

  // low-poly parts: a seven-sided cylinder per bone and a faceted ball at each joint
  const boneGeo = new CylinderGeometry(1, 1, 1, 7, 1, true);
  const jointGeo = new IcosahedronGeometry(1, 1);
  const add = (geo, m = new Mesh(geo, material)) => { m.castShadow = true; group.add(m); return m; };
  const q = new Quaternion(), d = new Vector3();
  function placeBone(mesh, a, b, r) {
    d.subVectors(b, a); const len = d.length();
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.quaternion.copy(q.setFromUnitVectors(UP, d.normalize()));
    mesh.scale.set(r, len, r);
  }
  function joint(p, r) { const m = add(jointGeo); m.position.copy(p); m.scale.setScalar(r); return m; }
  // a fixed chain of points with tapering radii
  function chain(points, radii) {
    for (let i = 0; i < points.length; i++) joint(points[i], radii[i]);
    for (let i = 0; i < points.length - 1; i++) placeBone(add(boneGeo), points[i], points[i + 1], (radii[i] + radii[i + 1]) / 2);
  }
  const v = (x, y, z) => new Vector3(x, y, z);

  // the index finger, extended: tip at the origin (matches the collider's radius)
  chain([v(0, 0, -PEG_R), v(0, 0, -0.27), v(0, 0, -0.53), v(0, -0.01, -0.9)], [PEG_R * 0.92, PEG_R * 0.96, PEG_R, PEG_R * 1.06]);
  // middle, ring and little fingers curled into a fist under the index finger: each a tight
  // hook (forward, down, back into the palm), close enough to touch, and kept behind the strand
  const curl = (y, z, r) => chain(
    [v(0, y, z), v(0, y - 0.05, z + 0.21), v(0, y - 0.21, z + 0.2), v(-0.01, y - 0.27, z + 0.04)],
    [r * 1.05, r, r * 0.95, r * 0.85]);
  curl(-0.15, -0.95, 0.08);
  curl(-0.3, -1.0, 0.077);
  curl(-0.44, -1.06, 0.068);
  // the mass of the fist, so the curled fingers read as one form rather than separate rungs
  const fist = add(new IcosahedronGeometry(1, 1));
  fist.position.set(-0.01, -0.42, -0.98); fist.scale.set(0.1, 0.3, 0.17);

  // the palm: a faceted block behind the knuckles
  const palm = add(new IcosahedronGeometry(1, 1));
  palm.position.set(0, -0.27, -1.3); palm.scale.set(0.11, 0.37, 0.42);
  // the forearm, reaching back and down out of the light
  const wrist = v(0.01, -0.32, -1.72), elbowSide = v(0.04, -0.7, -2.45);
  joint(wrist, 0.15);
  placeBone(add(boneGeo), wrist, elbowSide, 0.165);
  joint(elbowSide, 0.17);

  // the thumb: a fixed base on the side of the palm, then two bones driven by IK
  const thumbBase = v(0.07, -0.06, -1.36), thumbRoot = v(0.08, 0.1, -1.0);
  chain([thumbBase, thumbRoot], [0.085, 0.08]);
  const L1 = 0.27, L2 = 0.24, R1 = 0.07, R2 = 0.06;
  const bone1 = add(boneGeo), bone2 = add(boneGeo), knuckle = joint(v(), R1), tip = joint(v(), R2);
  // at rest the thumb tip sits on top of the finger, just behind the bead resting there
  const REST = v(0.035, PEG_R + 0.06, -0.5);
  const target = REST.clone(), want = new Vector3(), mid = new Vector3(), pole = new Vector3(1, 0.35, 0).normalize();   // the thumb's knuckle bends outward, not up

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
    placeBone(bone1, thumbRoot, mid, R1); placeBone(bone2, mid, end, (R1 + R2) / 2);
    knuckle.position.copy(mid); tip.position.copy(end);
  }

  // the stroke: while a bead travels, the thumb rides just behind it, pressing slightly
  // forward; when it has passed, the thumb lifts and settles back to rest
  let lift = 0;
  return {
    material,
    group,
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
    },
  };
}
