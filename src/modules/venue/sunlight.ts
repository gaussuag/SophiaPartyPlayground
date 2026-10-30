import { Color, ShaderMaterial, Vector3, Vector4 } from "three";
export const PARK_TREES = [[-22, -12], [-23, 4], [-19, -22], [20, -21], [23, -7], [23, 10], [-22, 21], [22, 22]] as const;
export const COURT_PALETTE = { surround: "#83a7cd", selected: "#7d9fcb", inactive: "#aabcc9", play: "#a399bd", kitchen: "#a1bbd3", line: "#fff9e6" };
const vertexShader = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormalWorld;
#ifdef USE_COLOR
varying vec3 vPaint;
#endif
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  #ifdef USE_COLOR
  vPaint = color;
  #endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
const fragmentShader = /* glsl */`
uniform vec3 uBase;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec4 uCanopies[8];
uniform float uTiles;
uniform float uWater;
varying vec3 vWorld;
varying vec3 vNormalWorld;
#ifdef USE_COLOR
varying vec3 vPaint;
#endif
float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 n = normalize(vNormalWorld);
  vec3 base = uBase;
  #ifdef USE_COLOR
  base *= vPaint;
  #endif
  float sun = max(0.0, dot(n, uSun));
  float sky = .5 + .5 * n.y;
  vec3 lit = base * (.70 + .18 * sky + .25 * sun);
  lit += vec3(.035, .025, .008) * sun;
  float textureNoise = grain(floor(vWorld.xz * 52.0)) - .5;
  lit *= 1.0 + textureNoise * .025;
  if (n.y > .65 && vWorld.y < .30) {
    float shade = 0.0;
    for (int i = 0; i < 8; i++) {
      vec2 q = (vWorld.xz - uCanopies[i].xy - vec2(1.4, .9)) / uCanopies[i].zw;
      float edge = 1.0 - smoothstep(.15, 1.0, dot(q, q));
      float dapples = .85 + .15 * sin(vWorld.x * 4.0) * sin(vWorld.z * 3.4);
      shade = max(shade, edge * dapples);
    }
    lit *= 1.0 - .18 * shade;
    vec2 pavers = abs(fract((vWorld.xz + vec2(.4, .1)) / 2.4) - .5);
    float seams = smoothstep(.485, .5, max(pavers.x, pavers.y));
    lit *= 1.0 - uTiles * seams * .065;
  }
  if (uWater > .5) {
    float wave = .5 + .5 * sin(vWorld.z * 3.7 + sin(vWorld.x * .7) * 1.5);
    float shimmer = pow(max(0.0, sin(vWorld.x * .31 + vWorld.z * 1.2)), 20.0);
    lit += vec3(.05, .09, .10) * wave + vec3(.21, .19, .13) * shimmer * .35;
  }
  float haze = smoothstep(28.0, 105.0, length(vWorld.xz));
  lit = mix(lit, uHaze, haze * .82);
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const materials = new Map<string, ShaderMaterial>();
/** Shared static daylight shader: warm sun, cool bounce, gentle grain and
 * canopy shadows. No clock, post-process, shadow map or extra render loop. */
export function sunlitMaterial(color: string, options: { vertexColors?: boolean; tiles?: boolean; water?: boolean } = {}) {
  const key = color + JSON.stringify(options);
  let material = materials.get(key);
  if (!material) {
    material = new ShaderMaterial({
      vertexShader, fragmentShader, vertexColors: !!options.vertexColors,
      uniforms: {
        uBase: { value: new Color(color) }, uHaze: { value: new Color("#e8efe8") },
        uSun: { value: new Vector3(-.6, 1, -.4).normalize() },
        uCanopies: { value: PARK_TREES.map(([x, z]) => new Vector4(x, z, 2.9, 1.8)) },
        uTiles: { value: options.tiles ? 1 : 0 }, uWater: { value: options.water ? 1 : 0 },
      },
    });
    materials.set(key, material);
  }
  return material;
}
