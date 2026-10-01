// Dust motes drifting in the lamp's beam.
// Rules from the spec: no twinkling, nothing smaller than 1.5 CSS px. Each mote is a soft
// round glow at least 2 px across whose brightness depends only on where it sits in the
// cone, so it fades smoothly in and out of the light instead of popping between pixels.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import { LAMP_HEX } from './palette.js';
import { rng } from './physics.js';

export const DUST = true;           // set false to remove the motes entirely
const COUNT = 160;

export function createDust(scene, lamp, renderer) {
  if (!DUST) return { update() {}, setLevel() {} };
  const R = rng(7);
  const base = new Float32Array(3 * COUNT), seed = new Float32Array(4 * COUNT);
  for (let i = 0; i < COUNT; i++) {
    base[3 * i] = (R() - 0.5) * 2.6;
    base[3 * i + 1] = 0.4 + R() * 8.6;
    base[3 * i + 2] = (R() - 0.5) * 2.6;
    seed.set([R() * 6.283, R() * 6.283, 0.6 + R() * 0.8, R()], 4 * i);   // two phases, speed, size
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(base, 3));
  geo.setAttribute('seed', new BufferAttribute(seed, 4));

  const lampDir = new Vector3().subVectors(lamp.target.position, lamp.position).normalize();
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLampPos: { value: lamp.position.clone() },
      uLampDir: { value: lampDir },
      uCosOuter: { value: Math.cos(lamp.angle) },
      uCosInner: { value: Math.cos(lamp.angle * (1 - lamp.penumbra)) },
      uPx: { value: renderer.getPixelRatio() },
      uLevel: { value: 1 },   // follows the lamp's brightness
      uColor: { value: new Color(LAMP_HEX).lerp(new Color('#ffffff'), 0.25) },   // the lamp's light, a touch paler
    },
    vertexShader: /* glsl */`
      attribute vec4 seed;
      uniform float uTime, uCosOuter, uCosInner, uPx, uLevel;
      uniform vec3 uLampPos, uLampDir;
      varying float vAlpha;
      void main() {
        float t = uTime * 0.05 * seed.z;
        // slow, smooth wander around each mote's home point, plus a very gentle sink
        vec3 p = position + vec3(sin(t + seed.x) * 0.22, sin(t * 0.7 + seed.y) * 0.3 - mod(uTime * 0.008 * seed.z + seed.w * 9.0, 9.0) + 4.5, cos(t * 0.8 + seed.x) * 0.22);
        p.y = mod(p.y, 9.0) + 0.3;
        vec3 d = p - uLampPos;
        float cone = smoothstep(uCosOuter, uCosInner, dot(normalize(d), uLampDir));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // world size ~0.012-0.02 units, never under 2 CSS px so it can't shimmer
        gl_PointSize = max(2.0 * uPx, (0.012 + 0.008 * seed.w) * uPx * projectionMatrix[1][1] * 400.0 / -mv.z);
        // fade out near the camera, toward the edges of the pool of light,
        // and near the top and bottom of the drift range, so wrapping around never pops
        vAlpha = uLevel * cone * 0.32 * smoothstep(0.6, 2.0, -mv.z) * smoothstep(0.3, 1.3, p.y) * (1.0 - smoothstep(8.3, 9.3, p.y));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(c, c) * 3.5) * vAlpha;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  return {
    update(dt) {
      if (!still.matches) mat.uniforms.uTime.value += dt;
      mat.uniforms.uPx.value = renderer.getPixelRatio();   // adaptive quality may change it
    },
    setLevel(k) { mat.uniforms.uLevel.value = k; },
  };
}
