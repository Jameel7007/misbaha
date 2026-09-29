// Meshes for the peg, beads, separators, imam, thread and tassel.
// Reads positions from physics.js every frame; never writes to the simulation.
import {
  Color, ConeGeometry, CylinderGeometry, InstancedMesh, LatheGeometry, Matrix4, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3,
} from 'three';
import { CA, CB, KIND, N, NL, PEG, PEG_BACK, PEG_R, SIZE, SPIN, TONE, X, sim } from './physics.js';

// a..b: the per-bead colour range; map: which texture the bead material uses
export const VARIETIES = {
  amber: { name: 'Amber', a: '#a8480a', b: '#e69a2c', css: 'radial-gradient(circle at 40% 35%, #f3b451, #b35a10 70%)', rough: 0.14, clear: 1, map: 'cloud', emissive: '#2a0e00', silk: '#1d4a3a', clack: 2700 },
  olive: { name: 'Olive', a: '#80552f', b: '#c79a62', css: 'radial-gradient(circle at 40% 35%, #d2a877, #7a512c 75%)', rough: 0.46, clear: 0.35, map: 'grain', emissive: '#000000', silk: '#6e1d25', clack: 1500 },
  ebony: { name: 'Ebony', a: '#150f0c', b: '#33241b', css: 'radial-gradient(circle at 40% 35%, #4a372b, #120c09 75%)', rough: 0.26, clear: 0.9, map: 'grain', emissive: '#000000', silk: '#b58f42', clack: 2000 },
};

export function createStrand(scene, tex) {
  // ── the peg ──
  const pegMat = new MeshPhysicalMaterial({ color: '#4a2c1b', map: tex.grain, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const pegGeo = new CylinderGeometry(PEG_R, PEG_R, 1, 36, 1, true); pegGeo.rotateX(Math.PI / 2);
  const pegBody = new Mesh(pegGeo, pegMat);
  const pegCap = new Mesh(new SphereGeometry(PEG_R, 32, 16), pegMat);
  pegBody.castShadow = pegCap.castShadow = true;
  scene.add(pegBody, pegCap);
  function placePeg() {
    const { pegEnd } = sim, len = Math.max(0.001, pegEnd - PEG_BACK);
    pegBody.scale.set(1, 1, len);
    pegBody.position.set(PEG.x, PEG.y, (PEG_BACK + pegEnd) / 2);
    pegCap.position.set(PEG.x, PEG.y, pegEnd);
    pegBody.visible = pegCap.visible = pegEnd > PEG_BACK + 0.05;
  }

  // ── beads, separators, imam, thread, tassel ──
  const beadIdx = [], sepIdx = [];
  for (let i = 1; i < NL; i++) (KIND[i] === 0 ? beadIdx : sepIdx).push(i);

  const beadMat = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, map: tex.cloud });
  const beads = new InstancedMesh(new SphereGeometry(1, 32, 22), beadMat, beadIdx.length);
  beads.castShadow = true; beads.frustumCulled = false;
  const sepMat = new MeshStandardMaterial({ color: '#d4ae62', metalness: 1, roughness: 0.26 });
  const seps = new InstancedMesh(new SphereGeometry(1, 28, 14), sepMat, sepIdx.length);
  seps.castShadow = true; seps.frustumCulled = false;

  const lathePts = [[0, -0.12], [0.02, -0.118], [0.036, -0.1], [0.05, -0.058], [0.052, -0.03], [0.044, 0.004], [0.031, 0.032], [0.036, 0.058], [0.033, 0.085], [0.02, 0.108], [0.008, 0.12], [0, 0.122]].map(p => new Vector2(p[0], p[1]));
  const imamMat = beadMat.clone();
  const imam = new Mesh(new LatheGeometry(lathePts, 36), imamMat);
  imam.castShadow = true;

  const threadMat = new MeshStandardMaterial({ color: '#1f4a3b', roughness: 0.75 });
  const threads = new InstancedMesh(new CylinderGeometry(1, 1, 1, 6, 1, true), threadMat, CA.length);
  threads.castShadow = true; threads.frustumCulled = false;
  const tasselGeo = new ConeGeometry(0.05, 0.24, 40, 1, false); tasselGeo.translate(0, -0.12, 0);
  const tasselMat = new MeshStandardMaterial({ color: '#1f4a3b', roughness: 0.85, map: tex.fringe });
  const tassel = new Mesh(tasselGeo, tasselMat);
  const knot = new Mesh(new SphereGeometry(0.03, 16, 12), threadMat);
  tassel.castShadow = knot.castShadow = true;
  scene.add(beads, seps, imam, threads, tassel, knot);

  const up = new Vector3(0, 1, 0), vA = new Vector3(), vB = new Vector3(), vS = new Vector3();
  const q = new Quaternion(), qs = new Quaternion(), m4 = new Matrix4();
  const P = i => vA.set(X[3 * i], X[3 * i + 1], X[3 * i + 2]);
  // point the bead's bore along the thread, then turn it by its own grain angle
  function orientAlong(i, prev, next, out) {
    out.set(X[3 * next] - X[3 * prev], X[3 * next + 1] - X[3 * prev + 1], X[3 * next + 2] - X[3 * prev + 2]);
    if (out.lengthSq() < 1e-10) out.set(0, 1, 0);
    q.setFromUnitVectors(up, out.normalize());
    qs.setFromAxisAngle(up, SPIN[i]);
    return q.multiply(qs);
  }

  function update() {
    beadIdx.forEach((i, n) => {
      orientAlong(i, (i - 1 + NL) % NL, (i + 1) % NL, vB);
      const s = SIZE[i];
      m4.compose(P(i), q, vS.set(s, s * 0.86, s));
      beads.setMatrixAt(n, m4);
    });
    beads.instanceMatrix.needsUpdate = true;
    sepIdx.forEach((i, n) => {
      orientAlong(i, i - 1, i + 1, vB);
      m4.compose(P(i), q, vS.set(0.047, 0.024, 0.047));
      seps.setMatrixAt(n, m4);
    });
    seps.instanceMatrix.needsUpdate = true;
    // imam: the loop enters its top, the tassel leaves its bottom
    vB.set((X[3] + X[3 * (NL - 1)]) / 2 - X[3 * NL], (X[4] + X[3 * (NL - 1) + 1]) / 2 - X[3 * NL + 1], (X[5] + X[3 * (NL - 1) + 2]) / 2 - X[3 * NL + 2]);
    if (vB.lengthSq() < 1e-8) vB.set(0, 1, 0);
    imam.quaternion.setFromUnitVectors(up, vB.normalize());
    imam.position.set(X[0], X[1], X[2]);
    for (let c = 0; c < CA.length; c++) {
      const i = CA[c], j = CB[c];
      vB.set(X[3 * j] - X[3 * i], X[3 * j + 1] - X[3 * i + 1], X[3 * j + 2] - X[3 * i + 2]);
      const len = vB.length() || 1e-4;
      q.setFromUnitVectors(up, vB.multiplyScalar(1 / len));
      vA.set((X[3 * i] + X[3 * j]) / 2, (X[3 * i + 1] + X[3 * j + 1]) / 2, (X[3 * i + 2] + X[3 * j + 2]) / 2);
      const r = i >= NL - 1 && (i >= NL || j >= NL) ? 0.012 : 0.0065;
      m4.compose(vA, q, vS.set(r, len, r));
      threads.setMatrixAt(c, m4);
    }
    threads.instanceMatrix.needsUpdate = true;
    const e = N - 1, e2 = N - 2;
    vB.set(X[3 * e] - X[3 * e2], X[3 * e + 1] - X[3 * e2 + 1], X[3 * e + 2] - X[3 * e2 + 2]);
    if (vB.lengthSq() < 1e-10) vB.set(0, -1, 0);
    tassel.quaternion.setFromUnitVectors(vA.set(0, -1, 0), vB.normalize());
    tassel.position.set(X[3 * e2], X[3 * e2 + 1], X[3 * e2 + 2]);
    knot.position.copy(tassel.position);
    placePeg();
  }

  function setVariety(key) {
    const v = VARIETIES[key], ca = new Color(v.a), cb = new Color(v.b), c = new Color();
    for (const mat of [beadMat, imamMat]) {
      mat.roughness = v.rough; mat.clearcoat = v.clear; mat.map = tex[v.map]; mat.emissive.set(v.emissive); mat.needsUpdate = true;
    }
    beadIdx.forEach((i, n) => { c.copy(ca).lerp(cb, 0.25 + TONE[i] * 0.75); beads.setColorAt(n, c); });
    beads.instanceColor.needsUpdate = true;
    imamMat.color.copy(ca).lerp(cb, 0.35);
    threadMat.color.set(v.silk); tasselMat.color.set(v.silk);
  }

  return { update, setVariety };
}
