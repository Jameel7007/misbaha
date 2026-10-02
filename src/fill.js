// Bounce fill for a material. The lamp points straight down, so a surface facing the viewer
// sideways gets almost no light and renders near black whatever its colour. In a room,
// light bouncing off the lit rug and the glowing wall fills that side; this adds that fill
// to one material: soft, warm, from the viewer's side and a little below, rising and
// falling with the lamp (uLampLevel, from scene.js gateToLamp, which must also be applied).
import { Color, Vector3 } from 'three';

const DIR = new Vector3(0.75, -0.25, 0.6).normalize();   // toward where the light comes from, in the world

export function addFill(material, strength = 0.55) {
  const before = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
  const uFill = { value: new Color(1, 0.86, 0.72).multiplyScalar(strength) }, uFillWorld = { value: DIR };
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uFill = uFill; shader.uniforms.uFillWorld = uFillWorld;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFill, uFillWorld;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        vec3 fillDir = normalize((viewMatrix * vec4(uFillWorld, 0.0)).xyz);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uFill * (0.25 + 0.75 * max(dot(normal, fillDir), 0.0)) * uLampLevel;`);
  };
  material.customProgramCacheKey = () => key() + '|fill';
  return uFill;
}
