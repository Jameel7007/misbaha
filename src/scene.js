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
import { clamp, PEG, WALL_Z } from './physics.js';
import { RUG, WALL_TILE } from './textures.js';

const NIGHT = 0x0f1217;
const LAMP_COLOUR = LAMP_HEX;    // a colour temperature, calibrated as white balance (palette.js)

// physical units: candela for the lamp and the wall glow (decay 2, 1 unit = 1 m)
export const LIGHTS = {
  lamp: { intensity: 380, pos: [0.5, 12.5, 1.2], target: [0, 4, 0], angle: 0.2, penumbra: 0.5 },  // beam runs down the strand; on the rug: full within ~1.25, dark by ~2.5
  glow: { intensity: 3, pos: [-1.3, 4.3, WALL_Z + 1.2], distance: 7 },   // offset so it sits behind the strand from the Count camera
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
    panel(8, 8, new Color(LAMP_COLOUR).multiplyScalar(5), [1.3, 10, 3.2]);     // the lamp: a broad shade, so reflections read clearly
    panel(9, 6, new Color(LAMP_COLOUR).multiplyScalar(0.22), [0, 1.5, -9]);    // warm wall glow behind
    panel(12, 2, new Color(0.06, 0.02, 0.015), [0, -6, 0]);    // faint bounce off the rug
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, 0.035).texture;
    pm.dispose();
  }
  // r169 ignores a material's envMapIntensity when it only inherits scene.environment,
  // so surfaces that need less reflected light hold the map themselves
  const dimEnv = intensity => ({ envMap: scene.environment, envMapIntensity: intensity, userData: { baseEnv: intensity } });

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
    uLampLevel: { value: 1 },   // the whole lamp's brightness, 0 → 1 as it fades up at the start
  };
  // chains after any shader edit the material already has (the amber glow uses the gate)
  function gateToLamp(material) {
    const before = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, gate);
      // a material may keep more of the reflected light outside the cone (userData.gateFloor,
      // a uniform object so it can be tuned live), as a surface right beside the beam
      // catches its spill
      if (material.userData.gateFloor) shader.uniforms.uGateFloor = material.userData.gateFloor;
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
        .replace('#include <common>', '#include <common>\nvarying float vLampGate;\nuniform float uLampLevel;')
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
    material.customProgramCacheKey = () => key() + '|lamp-gated';
    material.needsUpdate = true;
  }

  // a small warm light at the top of the peg: it glows as each bead passes (main.js)
  const pegGlow = new PointLight('#ffc07a', 0, 1.6, 2);
  pegGlow.position.set(PEG.x, PEG.y + 0.2, 0.28);
  scene.add(pegGlow);

  // 0 = the room in darkness, 1 = the lamp fully up: the lamp, the wall glow, reflections
  // (scene-wide and per-material) and anything gated to the lamp (the amber's inner glow)
  function setLightLevel(k) {
    lamp.intensity = L.intensity * k;
    glow.intensity = G.intensity * k;
    scene.environmentIntensity = k;
    gate.uLampLevel.value = k;
    scene.traverse(o => { const m = o.material; if (m && m.userData.baseEnv !== undefined) m.envMapIntensity = m.userData.baseEnv * k; });
  }

  return { renderer, scene, camera, lamp, glow, pegGlow, dimEnv, gateToLamp, setLightLevel };
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
  wall.position.set(0, rows * WALL_TILE / 2, WALL_Z);
  scene.add(wall);

  return { floor, rug, wall };
}

// orbit camera that eases toward a goal; one preset per mode, plus the wide opening shot.
// On phones the header and the control bar take part of the screen, so each preset can be
// framed into the free region: the camera moves back or closer until the subject (a box in
// the world) fills it, then the picture is shifted (a view offset, so the camera still looks the same way)
// until the subject sits in the middle of the region.
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export function createRig(camera) {
  const CAMS = {
    count: { tx: 0, ty: PEG.y - 0.6, tz: 0, dist: 4.6, az: 0.42, el: 0.12 },
    hold: { tx: 0, ty: 0.12, tz: 0, dist: 5.2, az: 0.3, el: 0.8 },
    intro: { tx: -0.6, ty: 3.4, tz: 0.8, dist: 13.5, az: 0.8, el: 0.3 },   // the room: wall, rug, strand
  };
  const params = mode => {
    const p = Object.assign({ ox: 0, oy: 0 }, CAMS[mode]), asp = camera.aspect;
    if (asp < 1) { p.dist *= Math.pow(1 / asp, 0.55); if (mode === 'count') p.ty = PEG.y - 0.35; }
    if (frame.region && frame.subjects[mode]) fit(p, frame.subjects[mode], frame.region);
    return p;
  };
  // frame.region: the free part of the screen in CSS pixels; subjects: per mode, corner points
  const frame = { region: null, subjects: {}, w: 1, h: 1 };
  const probe = new PerspectiveCamera(), v = new Vector3();
  function place(cam, p) {
    cam.position.set(p.tx + p.dist * Math.cos(p.el) * Math.sin(p.az), p.ty + p.dist * Math.sin(p.el), p.tz + p.dist * Math.cos(p.el) * Math.cos(p.az));
    cam.lookAt(p.tx, p.ty, p.tz);
  }
  function screenBox(p, pts) {
    probe.copy(camera); probe.clearViewOffset(); place(probe, p); probe.updateMatrixWorld(); probe.updateProjectionMatrix();
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of pts) {
      v.copy(q).project(probe);
      const x = (v.x + 1) / 2 * frame.w, y = (1 - v.y) / 2 * frame.h;
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    }
    return b;
  }
  function fit(p, pts, r) {
    const rw = r.right - r.left, rh = r.bottom - r.top;
    // on screen, size goes roughly as 1 / distance: pull back until the subject fits, or come
    // closer while there's room (but never past half the preset's distance)
    const near = p.dist * 0.5;
    for (let i = 0; i < 4; i++) {
      const b = screenBox(p, pts), s = Math.max((b[2] - b[0]) / (rw * 0.92), (b[3] - b[1]) / (rh * 0.92));
      if (Math.abs(s - 1) < 0.01) break;
      p.dist = Math.max(near, p.dist * s);
    }
    const b = screenBox(p, pts);
    p.ox = (b[0] + b[2]) / 2 - (r.left + r.right) / 2;
    p.oy = (b[1] + b[3]) / 2 - (r.top + r.bottom) / 2;
  }
  const cam = Object.assign({ ox: 0, oy: 0 }, CAMS.count), goal = Object.assign({ ox: 0, oy: 0 }, CAMS.count);
  let glide = null;
  return {
    preset(mode) { Object.assign(goal, params(mode)); },
    // the free region (or null) and the screen size; takes effect at the next preset()
    setFrame(region, subjects, w, h) { Object.assign(frame, { region, subjects, w, h }); },
    // after the free region changes without a mode change: re-aim only, keep the user's view
    reframe(mode) { const p = params(mode); goal.ox = p.ox; goal.oy = p.oy; },
    // reduced motion: no easing; the camera goes straight to where it's going
    instant: false,
    snap() { Object.assign(cam, goal); glide = null; },
    // a scripted move from another preset to the goal: eased in and out, so no overshoot
    glide(from, seconds) { glide = { from: params(from), t: 0, dur: seconds }; Object.assign(cam, glide.from); },
    // the same eased move, from wherever the camera is now (the change between modes)
    ease(seconds) { glide = { from: Object.assign({}, cam), t: 0, dur: seconds }; },
    orbit(dx, dy) {
      goal.az -= dx * 0.005;
      goal.el = clamp(goal.el + dy * 0.004, -0.15, 1.4);
    },
    zoom(deltaY) { goal.dist = clamp(goal.dist * Math.exp(deltaY * 0.001), 1.6, 14); },
    update(dt) {
      if (glide && this.instant) glide = null;
      if (glide) {
        glide.t += dt;
        const e = easeInOutCubic(Math.min(1, glide.t / glide.dur));
        for (const key in cam) cam[key] = glide.from[key] + (goal[key] - glide.from[key]) * e;
        if (glide.t >= glide.dur) glide = null;
      } else {
        const k = this.instant ? 1 : 1 - Math.exp(-dt * 3.2);
        for (const key in cam) cam[key] += (goal[key] - cam[key]) * k;
      }
      place(camera, cam);
      if (Math.abs(cam.ox) > 0.5 || Math.abs(cam.oy) > 0.5) camera.setViewOffset(frame.w, frame.h, cam.ox, cam.oy, frame.w, frame.h);
      else if (camera.view) camera.clearViewOffset();
    },
  };
}
