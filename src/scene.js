// Renderer, room, lights and the camera rig.
// Art direction: one warm lamp overhead in an otherwise dark room. The strand hangs in
// the brightest part of its cone, a faint warm glow on the wall behind it keeps the
// silhouette readable, and the rug only shows inside the lamp's pool of light.
import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, Color, DoubleSide, Fog, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight,
  Group, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { FLOOR_HEX, LAMP_HEX } from './palette.js';
import { clamp, PEG, PEG_BACK } from './physics.js';
import { RUG, WALL_TILE } from './textures.js';

const NIGHT = 0x0f1217;
const LAMP_COLOUR = LAMP_HEX;    // a colour temperature, calibrated as white balance (palette.js)

// physical units: candela for the lamp and the wall glow (decay 2, 1 unit = 1 m)
export const LIGHTS = {
  lamp: { intensity: 380, pos: [0.5, 12.5, 1.2], target: [0, 4, 0], angle: 0.2, penumbra: 0.5 },  // beam runs down the strand; on the rug: full within ~1.25, dark by ~2.5
  glow: { intensity: 3, pos: [-1.3, 4.3, PEG_BACK + 1.2], distance: 7 },   // offset so it sits behind the strand from the Count camera
};

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

  // reflections: a dark room whose only bright thing is the lamp's softbox, so every
  // highlight on the beads agrees with the real light
  {
    const s = new Scene();
    s.add(new Mesh(new BoxGeometry(30, 30, 30), new MeshBasicMaterial({ color: new Color(0.004, 0.0035, 0.003), side: BackSide })));
    const panel = (w, h, col, p) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: col, side: DoubleSide })); m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); s.add(m); };
    panel(5, 5, new Color(LAMP_COLOUR).multiplyScalar(7), [1.3, 10, 3.2]);     // the lamp
    panel(9, 6, new Color(LAMP_COLOUR).multiplyScalar(0.22), [0, 1.5, -9]);    // warm wall glow behind
    panel(12, 2, new Color(0.06, 0.02, 0.015), [0, -6, 0]);    // faint bounce off the rug
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, 0.035).texture;
    pm.dispose();
  }
  // r169 ignores a material's envMapIntensity when it only inherits scene.environment,
  // so surfaces that need less reflected light hold the map themselves
  const dimEnv = intensity => ({ envMap: scene.environment, envMapIntensity: intensity });

  const L = LIGHTS.lamp;
  const lamp = new SpotLight(LAMP_COLOUR, L.intensity, 0, L.angle, L.penumbra, 2);
  lamp.position.set(...L.pos);
  lamp.target.position.set(...L.target);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 4;
  lamp.shadow.camera.far = 20;
  lamp.shadow.bias = -0.0004;
  lamp.shadow.normalBias = 0.02;
  scene.add(lamp, lamp.target);

  // the soft warm spill that lights the tiled wall behind the strand (the wall itself is built in addRoom)
  const G = LIGHTS.glow;
  const glow = new PointLight(LAMP_COLOUR, G.intensity, G.distance, 2);   // the lamp's own warm white, so the blue tiles keep their colour
  glow.position.set(...G.pos);
  scene.add(glow);

  // Reflection-map light arrives from everywhere, so on its own it lights a bead the same
  // wherever it lies. Outside the cone a bead can't see the lamp, so its reflected light
  // (diffuse glow and highlights alike) fades with the cone, down to a faint remnant.
  const gate = {
    uLampPos: { value: lamp.position },
    uLampDir: { value: new Vector3().subVectors(lamp.target.position, lamp.position).normalize() },
    uCosOuter: { value: Math.cos(L.angle * 1.15) },
    uCosInner: { value: Math.cos(L.angle * (1 - L.penumbra)) },
    uGateFloor: { value: 0.1 },
  };
  function gateToLamp(material) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, gate);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uLampPos, uLampDir;\nuniform float uCosOuter, uCosInner, uGateFloor;\nvarying float vLampGate;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 gateWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            gateWorld = instanceMatrix * gateWorld;
          #endif
          gateWorld = modelMatrix * gateWorld;
          vLampGate = mix(uGateFloor, 1.0, smoothstep(uCosOuter, uCosInner, dot(normalize(gateWorld.xyz - uLampPos), uLampDir)));`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLampGate;')
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
          #if defined( RE_IndirectDiffuse )
            iblIrradiance *= vLampGate;
          #endif
          #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
            radiance *= vLampGate;
            #ifdef USE_CLEARCOAT
              clearcoatRadiance *= vLampGate;
            #endif
          #endif`);
    };
    material.customProgramCacheKey = () => 'lamp-gated';
    material.needsUpdate = true;
  }

  return { renderer, scene, camera, lamp, glow, dimEnv, gateToLamp };
}

// The room's surfaces: a slate floor, a prayer rug laid with its top toward the wall (as
// a prayer rug faces the qibla), and the tiled wall the peg comes out of.
// The field is laid out in whole pattern tiles so a star sits exactly under the strand,
// and the right-hand and top borders cross the lamp's pool, so the lighter border shows.
export function addRoom(scene, tex, dimEnv) {
  const flat = (w, h, material) => { const g = new PlaneGeometry(w, h); g.rotateX(-Math.PI / 2); const m = new Mesh(g, material); m.receiveShadow = true; return m; };
  const wool = map => new MeshStandardMaterial({ map, roughness: 0.96, metalness: 0, dithering: true, ...dimEnv(0.06) });

  const floor = flat(40, 40, new MeshStandardMaterial({ color: FLOOR_HEX, roughness: 0.9, dithering: true, ...dimEnv(0.06) }));
  scene.add(floor);

  const rug = new Group();
  rug.position.y = 0.004;                                  // just above the floor
  const T = RUG.tile, B = RUG.border;
  const x0 = -6 * T, x1 = 2 * T, z0 = -2 * T, z1 = 12 * T;  // field edges, in whole tiles
  const W = x1 - x0, H = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const field = tex.field.clone();
  field.repeat.set(W / T, H / T);
  const f = flat(W, H, wool(field)); f.position.set(cx, 0, cz); rug.add(f);

  // border strips and corners; turn = rotation about y that points the outer edge outward
  const strip = (len, x, z, turn) => {
    const t = tex.border.clone(); t.repeat.set(len / RUG.period, 1);
    const m = flat(len, B, wool(t)); m.position.set(x, 0, z); m.rotation.y = turn; rug.add(m);
  };
  strip(W, cx, z0 - B / 2, 0);                 // top, toward the wall
  strip(W, cx, z1 + B / 2, Math.PI);           // bottom
  strip(H, x0 - B / 2, cz, Math.PI / 2);       // left
  strip(H, x1 + B / 2, cz, -Math.PI / 2);      // right
  const cornerMat = wool(tex.corner);
  for (const [x, z, turn] of [[x0 - B / 2, z0 - B / 2, 0], [x1 + B / 2, z0 - B / 2, -Math.PI / 2], [x1 + B / 2, z1 + B / 2, Math.PI], [x0 - B / 2, z1 + B / 2, Math.PI / 2]]) {
    const m = flat(B, B, cornerMat); m.position.set(x, 0, z); m.rotation.y = turn; rug.add(m);
  }
  scene.add(rug);

  // glazed star-and-cross tiles on the wall, whole tiles either side of the peg. A satin
  // glaze (roughness 0.65): glossier tiles mirror the glow as a hotspot brighter than the beads
  const tiles = tex.tiles.clone();
  const cols = 28, rows = 17;
  tiles.repeat.set(cols, rows);
  const wall = new Mesh(new PlaneGeometry(cols * WALL_TILE, rows * WALL_TILE), new MeshStandardMaterial({ map: tiles, roughness: 0.65, metalness: 0, dithering: true, ...dimEnv(0.12) }));
  wall.position.set(0, rows * WALL_TILE / 2, PEG_BACK);
  scene.add(wall);

  return { floor, rug, wall };
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
