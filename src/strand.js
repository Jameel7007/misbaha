// Meshes for the peg, beads, separators, imam, thread and tassel.
// Reads positions from physics.js every frame; never writes to the simulation.
import {
  Color, ConeGeometry, CylinderGeometry, InstancedBufferAttribute, InstancedMesh, LatheGeometry, Matrix4, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3,
} from 'three';
import { CA, CB, KIND, N, NL, PEG, PEG_BACK, PEG_R, RNG_SEED, SIZE, SPIN, TONE, X, rng, sim } from './physics.js';

// a..b: the per-bead colour range; map: which texture the bead material uses;
// glow: strength of the inner glow (amber only; wood is opaque);
// cloudy: a share of beads that are opaque "butterscotch" amber, and their colour
export const VARIETIES = {
  amber: { name: 'Amber', a: '#a4500c', b: '#f0a53a', css: 'radial-gradient(circle at 40% 35%, #f6bb55, #a4500c 72%)', rough: 0.2, clear: 1, clearRough: 0.1, map: 'inclusions', glow: 1, cloudy: { share: 0.12, colour: '#e3a646' }, silk: '#1d4a3a', clack: 2700 },
  olive: { name: 'Olive', a: '#80552f', b: '#c79a62', css: 'radial-gradient(circle at 40% 35%, #d2a877, #7a512c 75%)', rough: 0.46, clear: 0.35, clearRough: 0.2, map: 'grain', glow: 0, silk: '#6e1d25', clack: 1500 },
  ebony: { name: 'Ebony', a: '#1a130f', b: '#443022', css: 'radial-gradient(circle at 40% 35%, #4a372b, #120c09 75%)', rough: 0.26, clear: 0.9, clearRough: 0.12, map: 'grain', glow: 0, silk: '#b58f42', clack: 2000 },
};

// Amber as a solid, polished resin with a fake inner glow. Real see-through amber
// (transmission) refracts the dark room behind it and turns muddy, so instead light is
// added where the surface faces the viewer, as in polished Baltic amber:
//  - the core glows, lighter and more yellow than the body (light that has travelled only a
//    short way through the resin), and the rim deepens toward red (a longer path);
//  - the surface itself takes little light (translucent), so the brightness is inside;
//  - an exit glow low in each clear bead, where light from the lamp above leaves it;
//  - the glow follows the lamp's cone (vLampGate from gateToLamp in scene.js), so a bead in
//    the dark doesn't glow;
//  - clear beads show small dark inclusions (the map); butterscotch beads (vCloud = 1) are
//    milky and opaque: cloudy swirls, full surface colour, little glow, a softer finish.
function amberGlow(material, glow, cloudMap) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uGlow = glow;
    shader.uniforms.uCloudMap = { value: cloudMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef USE_INSTANCING\nattribute float aCloud;\n#endif\nvarying float vCloud;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvCloud = aCloud;\n#else\nvCloud = 0.0;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform sampler2D uCloudMap;\nvarying float vCloud;')
      .replace('#include <map_fragment>', `vec3 preMap = diffuseColor.rgb;
        #include <map_fragment>
        vec3 inclusion = vec3(1.0);
        #ifdef USE_MAP
          // clear amber: the flecks are inside, so keep the skin clean and show them in the glow;
          // butterscotch: add the cloudy swirls to the surface
          inclusion = sampledDiffuseColor.rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, preMap, uGlow * (1.0 - vCloud));
          diffuseColor.rgb *= mix(vec3(1.0), texture2D(uCloudMap, vMapUv).rgb, vCloud * uGlow);
        #endif`)
      // after the per-bead colour is applied (color_fragment), keep the full colour for the
      // glow and dim what the surface itself reflects
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 amberColour = diffuseColor.rgb;
        diffuseColor.rgb *= mix(mix(1.0, 0.45, uGlow), 1.0, vCloud);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, vCloud);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
          float core = 0.06 + 0.6 * pow(facing, 2.2);
          float clear = uGlow * (1.0 - vCloud);
          // the core: more yellow (more green, less blue keeps it saturated under tone mapping),
          // with the inclusions seen as dark flecks against it, strongest at the centre
          vec3 coreColour = mix(amberColour, amberColour * vec3(1.0, 1.3, 0.8), clear) * mix(vec3(1.0), inclusion, facing * clear);
          diffuseColor.rgb = mix(diffuseColor.rgb, pow(diffuseColor.rgb, vec3(1.35)), (1.0 - facing) * clear);   // rim: deeper, redder
          // the exit glow: light from the lamp above focuses through the bead and leaves near its
          // lower side, the bright crescent that makes clear amber and glass read as translucent
          vec3 downView = normalize((viewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz);
          float exitGlow = smoothstep(0.15, 0.85, dot(normal, downView)) * pow(facing, 0.6) * 0.55 * clear;
          totalEmissiveRadiance += coreColour * (core + exitGlow) * uGlow * vLampGate * (1.0 - 0.75 * vCloud);
        }`);
  };
  material.customProgramCacheKey = () => 'amber-glow';
}

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

  const glow = { value: 1 };   // shared by the beads and the imam; set per material
  const beadMat = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, map: tex.inclusions });
  const beadGeo = new SphereGeometry(1, 32, 22);
  const cloudAttr = new InstancedBufferAttribute(new Float32Array(beadIdx.length), 1);
  beadGeo.setAttribute('aCloud', cloudAttr);
  const beads = new InstancedMesh(beadGeo, beadMat, beadIdx.length);
  // which beads are butterscotch: a fixed, seeded choice so the strand is the same every load
  const cloudPick = (() => { const R = rng(RNG_SEED, 999); return beadIdx.map(() => R()); })();
  beads.castShadow = true; beads.frustumCulled = false;
  const sepMat = new MeshStandardMaterial({ color: '#d4ae62', metalness: 1, roughness: 0.26 });
  const seps = new InstancedMesh(new SphereGeometry(1, 28, 14), sepMat, sepIdx.length);
  seps.castShadow = true; seps.frustumCulled = false;

  const lathePts = [[0, -0.12], [0.02, -0.118], [0.036, -0.1], [0.05, -0.058], [0.052, -0.03], [0.044, 0.004], [0.031, 0.032], [0.036, 0.058], [0.033, 0.085], [0.02, 0.108], [0.008, 0.12], [0, 0.122]].map(p => new Vector2(p[0], p[1]));
  const imamMat = beadMat.clone();
  amberGlow(beadMat, glow, tex.cloud); amberGlow(imamMat, glow, tex.cloud);
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
      mat.roughness = v.rough; mat.clearcoat = v.clear; mat.clearcoatRoughness = v.clearRough; mat.map = tex[v.map]; mat.needsUpdate = true;
    }
    glow.value = v.glow;
    const cloudy = v.cloudy, cc = cloudy ? new Color(cloudy.colour) : null;
    beadIdx.forEach((i, n) => {
      const isCloudy = cloudy && cloudPick[n] < cloudy.share;
      if (isCloudy) c.copy(cc).lerp(cb, TONE[i] * 0.3);   // butterscotch: milky yellow, a little variation
      else c.copy(ca).lerp(cb, 0.1 + TONE[i] * 0.85);     // clear amber: cognac to honey
      beads.setColorAt(n, c);
      cloudAttr.array[n] = isCloudy ? 1 : 0;
    });
    beads.instanceColor.needsUpdate = true;
    cloudAttr.needsUpdate = true;
    imamMat.color.copy(ca).lerp(cb, 0.35);
    threadMat.color.set(v.silk); tasselMat.color.set(v.silk);
  }

  return { update, setVariety, materials: [beadMat, imamMat, sepMat, threadMat, tasselMat, pegMat] };
}
