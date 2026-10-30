import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape, ShapeGeometry, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Palette = { face: string; accent: string };
const palettes: readonly Palette[] = [
  { face: "#287d82", accent: "#f1bf78" }, { face: "#cf705e", accent: "#ffe8b4" },
  { face: "#5474ac", accent: "#d7eeed" }, { face: "#a46289", accent: "#f9d696" },
  { face: "#66783e", accent: "#e6d6aa" }, { face: "#cd9650", accent: "#fff1cd" },
  { face: "#b07ac6", accent: "#ffe1a0" }, { face: "#395b7e", accent: "#b8d8de" },
  { face: "#ae4c65", accent: "#f5c5aa" }, { face: "#5f8e69", accent: "#f7e7b5" },
  { face: "#655c9b", accent: "#d4d2f5" }, { face: "#ad643e", accent: "#f5dca4" },
  { face: "#439e9c", accent: "#e6f0cd" },
];
const ids = ["W01", "W02", "W03", "W04", "W05", "W06", "B01", "B02", "B03", "B04", "B05", "B06", "B07"];
/** Stable presentation-only colour identity; never derived from array order or team side. */
export function paddleAppearance(playerId: string) {
  const known = ids.indexOf(playerId);
  const index = known < 0 ? [...playerId].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % palettes.length : known;
  return { key: index, ...palettes[index] };
}
export { PADDLE_MOUNT, PADDLE_TIP } from "./paddle-pose";

function outline() {
  const s = new Shape();
  s.moveTo(-.05, .08); s.lineTo(-.105, .135);
  s.quadraticCurveTo(-.172, .195, -.172, .275);
  s.lineTo(-.172, .415); s.quadraticCurveTo(-.172, .51, -.075, .51);
  s.lineTo(.075, .51); s.quadraticCurveTo(.172, .51, .172, .415);
  s.lineTo(.172, .275); s.quadraticCurveTo(.172, .195, .105, .135);
  s.lineTo(.05, .08); s.closePath(); return s;
}
function stripe(points: number[][], z: number) {
  const s = new Shape(); points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
  const g = new ShapeGeometry(s); if (z < 0) g.rotateY(Math.PI);
  return g.translate(0, 0, z);
}
type Paint = "face" | "accent" | "guard" | "grip" | "stitch" | "skin";
const pieces: { geometry: BufferGeometry; paint: Paint }[] = [];
const add = (geometry: BufferGeometry, paint: Paint) => pieces.push({ geometry, paint });
const core = new ExtrudeGeometry(outline(), { depth: .034, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 1, steps: 1, curveSegments: 4 }).translate(0, 0, -.017);
add(core, "guard");
for (const side of [-1, 1]) {
  const face = new ShapeGeometry(outline(), 4).translate(0, -.30, 0).scale(.915, .94, 1).translate(0, .30, 0);
  if (side < 0) face.rotateY(Math.PI);
  add(face.translate(0, 0, side * .0235), "face");
  add(stripe([[-.141, .258], [-.141, .295], [.141, .405], [.141, .368]], side * .0245), "accent");
  add(stripe([[-.141, .318], [-.141, .328], [.121, .43], [.133, .424]], side * .025), "stitch");
}
add(new CylinderGeometry(.027, .031, .19, 10).translate(0, -.012, 0), "grip");
add(new CylinderGeometry(.034, .032, .023, 10).translate(0, .087, 0), "guard");
add(new CylinderGeometry(.035, .039, .02, 10).translate(0, -.117, 0), "accent");
for (const y of [-.075, -.04, -.005, .03]) add(new CylinderGeometry(.032, .032, .005, 10).translate(0, y, 0), "stitch");
// Palm and thumb wrap the handle. They are merged into the same draw as the bat.
add(new SphereGeometry(.067, 10, 6).scale(1, .9, .8).translate(-.014, -.005, .029), "skin");
add(new SphereGeometry(.029, 8, 5).scale(.72, 1.5, 1).rotateZ(-.55).translate(.036, .012, .032), "skin");
const cache = new Map<string, BufferGeometry>();
/** Build and colour once per palette/skin; all frames reuse immutable GPU buffers.
 * A single mesh/material includes the face, guard, grip, graphics and hand. */
export function paddleGeometry(playerId: string, skin: string) {
  const palette = paddleAppearance(playerId), key = palette.key + ":" + skin;
  let geometry = cache.get(key);
  if (!geometry) {
    const colors = { ...palette, skin, guard: "#29353d", grip: "#34363a", stitch: "#e8e0cd" };
    const parts = pieces.map(piece => {
      const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
      const color = new Color(colors[piece.paint]), count = g.getAttribute("position").count;
      const values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) color.toArray(values, i * 3);
      g.setAttribute("color", new BufferAttribute(values, 3)); return g;
    });
    geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); cache.set(key, geometry);
  }
  return geometry;
}
export const paddleMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .04 });
