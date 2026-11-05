import * as THREE from 'three';
import { assets } from '../core/Assets';

/*
 * Global guard against "fireflies": a light a few centimetres from a glossy surface
 * gives a specular term far above the half-float range of the HDR target (Inf/NaN),
 * which the post pass then splits into red/green/blue dots (seen on iPad). Direct
 * specular is capped and every lit material's output is sanitised before it is written.
 */
if (!THREE.ShaderChunk.lights_fragment_end.includes('FIREFLY')) {
  THREE.ShaderChunk.lights_fragment_end += '\n// FIREFLY guard\nreflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(3.0));\n';
  THREE.ShaderChunk.opaque_fragment = 'if (!(outgoingLight.r + outgoingLight.g + outgoingLight.b < 1.0e4)) outgoingLight = vec3(0.0);\noutgoingLight = clamp(outgoingLight, 0.0, 48.0);\n' + THREE.ShaderChunk.opaque_fragment;
}

/** Uniforms shared by every patched material (one upload per frame). */
export const shared = {
  uTime: { value: 0 },
  uHum: { value: 0 },          // global "Hum" intensity -> infection glow
};

/**
 * Patches a standard material so that a per-vertex `aBake` attribute
 * (rgb = baked indirect light, a = ambient occlusion) is applied:
 * albedo *= AO, emissive += albedo * bakedLight. This is our mobile
 * "baked lighting": static GI-lite + AO for zero runtime cost.
 */
export function patchBaked(mat: THREE.MeshStandardMaterial, opts: { rm?: boolean; vcEmissive?: boolean } = {}) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 aBake;\nvarying vec4 vBake;${opts.rm ? '\nattribute vec2 _rm;\nvarying vec2 vRM;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBake = aBake;${opts.rm ? '\nvRM = _rm;' : ''}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vBake;${opts.rm ? '\nvarying vec2 vRM;' : ''}\nuniform float uTime;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${opts.vcEmissive ? 'float vcEmi = 1.0 - vColor.a;\n' : ''}diffuseColor.a = opacity;\ndiffuseColor.rgb *= vBake.a;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${opts.rm ? '\nroughnessFactor *= vRM.x;' : ''}\nroughnessFactor = max(roughnessFactor, 0.62);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>${opts.rm ? '\nmetalnessFactor = vRM.y;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake.rgb;${opts.vcEmissive ? '\ntotalEmissiveRadiance += vColor.rgb * vcEmi * 2.2;' : ''}`)
      // floors/walls/ceilings are matte up close: a light half a metre away drew streaks
      // and sparkling dots along normal-mapped tile grout
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular = min(reflectedLight.directSpecular * 0.4, vec3(0.3));');
  };
  mat.customProgramCacheKey = () => 'baked' + (opts.rm ? 'rm' : '') + (opts.vcEmissive ? 've' : '');
  return mat;
}

const surfCache = new Map<string, THREE.MeshStandardMaterial>();
const SURF: Record<string, { color?: number; rough?: number; metal?: number; normal?: number; tint?: number }> = {
  ground_forest: { color: 0x8a8478, normal: 1.0 }, ground_mud: { color: 0x7a6d60, rough: 0.85 }, ground_grass: { color: 0x7c8270 },
  asphalt: { color: 0x7a7a7a }, road: { color: 0x8a8a8a }, concrete: { color: 0x9a968e }, concrete_light: { color: 0xb5b2a8 },
  plaster: { color: 0xa8a49a }, tiles_white: { color: 0xa9aca8, rough: 0.72, normal: 0.6 }, tiles_check: { color: 0x9a948c, rough: 0.7, normal: 0.6 },
  ceiling: { color: 0x9a9890 }, wood_floor: { color: 0x9b8a7a, rough: 0.75 }, planks: { color: 0x8c7e70 }, bricks: { color: 0x9c8a7a },
  roof: { color: 0x6a6a6a }, metal_floor: { color: 0x8a8c90, metal: 0.6, rough: 0.6 }, metal_rust: { color: 0x8a7a70, metal: 0.4 },
  metal_painted: { color: 0x9a9c98, metal: 0.25 }, metal_green: { color: 0x8a9a90, metal: 0.25 }, rock: { color: 0x7c8088, normal: 1.4 },
  gravel: { color: 0x5e5c58 }, wallpaper: { color: 0x8c8274 },
};

/** Tiled PBR surface with baked light/AO support. */
export function surface(name: string, repeat = 0.5): THREE.MeshStandardMaterial {
  const key = name + ':' + repeat;
  let m = surfCache.get(key);
  if (m) return m;
  const cfg = SURF[name] || {};
  const map = assets.texture(`textures/surfaces/${name}_c.jpg`, true);
  const nrm = assets.texture(`textures/surfaces/${name}_n.jpg`);
  const rgh = assets.texture(`textures/surfaces/${name}_r.jpg`);
  m = new THREE.MeshStandardMaterial({
    map, normalMap: nrm, roughnessMap: rgh,
    color: cfg.color ?? 0xffffff, roughness: cfg.rough ?? 1, metalness: cfg.metal ?? 0,
    normalScale: new THREE.Vector2(cfg.normal ?? 1, cfg.normal ?? 1),
  });
  patchBaked(m);
  surfCache.set(key, m);
  return m;
}

let propMat: THREE.MeshStandardMaterial | null = null;
/** One material for every static prop: colours/roughness/metal/emissive live in vertex data. */
export function propMaterial() {
  if (propMat) return propMat;
  propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  patchBaked(propMat, { rm: true, vcEmissive: true });
  return propMat;
}

let dynPropMat: THREE.MeshStandardMaterial | null = null;
/** Same look for movable props (doors, pickups) lit by a uniform instead of vertex bake. */
export function dynamicPropMaterial() {
  if (dynPropMat) return dynPropMat;
  dynPropMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  dynPropMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 _rm;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = _rm;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat vcEmi = 1.0 - vColor.a; diffuseColor.a = opacity;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vcEmi * 2.2 + diffuseColor.rgb * 0.06;');
  };
  dynPropMat.customProgramCacheKey = () => 'dynprop';
  return dynPropMat;
}

const charCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Character shading extras: pulsing infection glow (per-instance phase),
 * baked light pickup (uBake) and a faint fresnel rim so silhouettes stay
 * readable in near darkness without flattening the image.
 */
export function patchCharacter(m: THREE.MeshStandardMaterial, rim: number, bake?: { value: THREE.Color }) {
  m.userData.rim = rim;
  m.userData.bake = bake || { value: new THREE.Color(0.02, 0.02, 0.025) };
  const uPhase = { value: Math.random() * 6.28 }, uRim = { value: rim };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uTime: shared.uTime, uHum: shared.uHum, uBake: m.userData.bake, uPhase, uRim });
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uHum; uniform vec3 uBake; uniform float uPhase; uniform float uRim;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= 0.55 + 0.45 * sin(uTime * 2.1 + uPhase + vMapUv.y * 9.0) + uHum * 0.8;
totalEmissiveRadiance += diffuseColor.rgb * uBake;
float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
totalEmissiveRadiance += vec3(0.55, 0.62, 0.72) * pow(rimF, 3.0) * uRim;`);
  };
  m.customProgramCacheKey = () => 'char';
}
/**
 * Character skin material: painted albedo/normal/roughness plus an emissive
 * "Hum" infection mask that pulses. `uBake` receives the baked light at the
 * character's position each frame so characters sit correctly in the scene.
 */
export function characterMaterial(variant: string, glowColor = 0x5fe8d0, glowStrength = 1): THREE.MeshStandardMaterial {
  const key = variant + glowStrength;
  let m = charCache.get(key);
  if (m) return m;
  const tex = (n: string, srgb = false) => { const t = assets.texture(`textures/characters/${variant}_${n}.jpg`, srgb, false); t.flipY = false; return t; };
  m = new THREE.MeshStandardMaterial({
    map: tex('albedo', true), normalMap: tex('normal'), roughnessMap: tex('rough'),
    emissiveMap: tex('glow'), emissive: new THREE.Color(glowColor), emissiveIntensity: variant === 'player' ? 0 : 0.45 * glowStrength,
    roughness: 1, metalness: 0,
  });
  patchCharacter(m, variant === 'player' ? 0.22 : 0.16);
  m.customProgramCacheKey = () => 'char';
  charCache.set(key, m);
  return m;
}

/** Shared per-instance bake uniform: characters clone their own to get local lighting. */
export function cloneCharacterMaterial(base: THREE.MeshStandardMaterial) {
  const m = base.clone();
  patchCharacter(m, base.userData.rim ?? 0.16);
  return m;
}

let waterMat: THREE.MeshStandardMaterial | null = null;
export function waterMaterial() {
  if (waterMat) return waterMat;
  const n = assets.texture('textures/surfaces/rock_n.jpg');
  waterMat = new THREE.MeshStandardMaterial({ color: 0x0a1014, roughness: 0.08, metalness: 0.2, normalMap: n, normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.92 });
  waterMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_NORMALMAP\nvNormalMapUv += vec2(uTime * 0.02, uTime * 0.013);\n#endif');
  };
  waterMat.customProgramCacheKey = () => 'water';
  return waterMat;
}
