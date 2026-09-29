// Renderer, room, lights and the camera rig.
import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, Color, DirectionalLight, DoubleSide, Fog,
  HemisphereLight, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { clamp, PEG } from './physics.js';

// The baseline ran three r128, which read bare hex numbers as *linear* colours and
// scaled every light by π internally. r152+ reads hex as sRGB and uses physical light
// units, so these two helpers reproduce the baseline's look exactly until Stage 1 relights.
const legacyHex = hex => new Color().setHex(hex, LinearSRGBColorSpace);
const LEGACY_LIGHT = Math.PI;

const NIGHT = 0x0f1217;

// throws if WebGL 2 is unavailable; the caller shows the fallback
export function createStage(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(NIGHT);
  scene.fog = new Fog(NIGHT, 9, 24);
  const camera = new PerspectiveCamera(32, 1, 0.05, 80);

  // studio reflections: a few glowing panels baked into an environment map
  {
    const s = new Scene();
    s.add(new Mesh(new BoxGeometry(30, 30, 30), new MeshBasicMaterial({ color: legacyHex(0x14161b), side: BackSide })));
    const panel = (w, h, col, p) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: col, side: DoubleSide })); m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); s.add(m); };
    panel(7, 4, new Color(5.0, 4.1, 3.0), [5, 7, 6]);
    panel(3, 7, new Color(0.7, 0.85, 1.25), [-8, 3, 2]);
    panel(10, 1.6, new Color(1.6, 1.35, 1.1), [0, 10, -5]);
    panel(12, 2, new Color(0.35, 0.12, 0.1), [0, -6, 0]);
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, 0.035).texture;
    pm.dispose();
  }

  const key = new DirectionalLight(legacyHex(0xffe0b8), 2.4 * LEGACY_LIGHT);
  key.position.set(3, 10, 5);
  key.target.position.set(0, 2.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5.5, bottom: -5.5, near: 1, far: 26 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new DirectionalLight(legacyHex(0x9db4ff), 0.9 * LEGACY_LIGHT);
  rim.position.set(-5, 6, -6);
  scene.add(rim);
  scene.add(new HemisphereLight(legacyHex(0x7f8fa8), legacyHex(0x2a1210), 0.35 * LEGACY_LIGHT));

  return { renderer, scene, camera };
}

export function addRug(scene, tex) {
  const rug = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ map: tex.rug, roughness: 0.96, metalness: 0 }));
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  scene.add(rug);
}

// orbit camera that eases toward a goal; one preset per mode
export function createRig(camera) {
  const CAMS = {
    count: { tx: 0, ty: PEG.y - 0.6, tz: 0, dist: 4.6, az: 0.42, el: 0.12 },
    hold: { tx: 0, ty: 0.12, tz: 0, dist: 5.2, az: 0.3, el: 0.8 },
  };
  const cam = Object.assign({}, CAMS.count), goal = Object.assign({}, CAMS.count);
  return {
    preset(mode) {
      const p = Object.assign({}, CAMS[mode]), asp = camera.aspect;
      if (asp < 1) { p.dist *= Math.pow(1 / asp, 0.55); if (mode === 'count') p.ty = PEG.y - 0.35; }
      Object.assign(goal, p);
    },
    snap() { Object.assign(cam, goal); },
    orbit(dx, dy) {
      goal.az -= dx * 0.005;
      goal.el = clamp(goal.el + dy * 0.004, -0.15, 1.4);
    },
    zoom(deltaY) { goal.dist = clamp(goal.dist * Math.exp(deltaY * 0.001), 1.6, 14); },
    update(dt) {
      const k = 1 - Math.exp(-dt * 3.2);
      for (const key in cam) cam[key] += (goal[key] - cam[key]) * k;
      camera.position.set(cam.tx + cam.dist * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.dist * Math.sin(cam.el), cam.tz + cam.dist * Math.cos(cam.el) * Math.cos(cam.az));
      camera.lookAt(cam.tx, cam.ty, cam.tz);
    },
  };
}
