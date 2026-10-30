import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PARK_TREES } from "./sunlight";
type Point = readonly [number, number, number];
type Part = { geometry: BufferGeometry; color: string };
export const PARK_AMENITIES = [
  { kind: "pavilion", x: -24, z: -9, width: 6.8, depth: 5, height: 3.9 },
  { kind: "bench", x: -8, z: 13.5, width: 3.8, depth: 1.2, height: 1.05 },
  { kind: "bench", x: 6, z: 13.5, width: 3.8, depth: 1.2, height: 1.05 },
  { kind: "bench", x: 17, z: 3.5, width: 1.2, depth: 3.8, height: 1.05 },
  { kind: "city", x: 6, z: -45, width: 5, depth: 5, height: 11 },
  { kind: "city", x: 14, z: -49, width: 5.5, depth: 5.5, height: 15 },
  { kind: "city", x: 23, z: -44, width: 6, depth: 4.5, height: 10 },
] as const;
function painted(parts: Part[]) {
  const geometries = parts.map(({ geometry, color }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const rgb = new Color(color), count = g.getAttribute("position").count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
    g.setAttribute("color", new BufferAttribute(colors, 3)); return g;
  });
  const merged = mergeGeometries(geometries)!;
  const retired = new Set([...geometries, ...parts.map(p => p.geometry)]); retired.forEach(g => g.dispose());
  merged.computeBoundingBox(); merged.computeBoundingSphere(); return merged;
}
function createPark() {
  const props: Part[] = [], paving: Part[] = [];
  const add = (g: BufferGeometry, color: string, list = props) => list.push({ geometry: g, color });
  const box = (size: Point, at: Point, color: string, yaw = 0, list = props) => add(new BoxGeometry(...size).rotateY(yaw).translate(...at), color, list);
  const pole = (at: Point, height: number, radius: number, color: string) => add(new CylinderGeometry(radius, radius * 1.15, height, 7).translate(at[0], at[1] + height / 2, at[2]), color);
  const leaf = (at: Point, scale: Point, color: string) => add(new IcosahedronGeometry(1, 0).scale(...scale).translate(...at), color);
  // Continuous sports plaza, promenade links and low edge planting.
  box([2, .04, 35], [-16, -.05, -.8], "#dcd9c9", 0, paving);
  box([2, .04, 35], [16, -.05, -.8], "#dcd9c9", 0, paving);
  box([34, .04, 2.2], [0, -.05, 15.8], "#dcd9c9", 0, paving);
  box([48, .04, 3.5], [-5, -.05, -18.4], "#dcd9c9", 0, paving);
  box([10, .04, 3.6], [-22, -.05, -9], "#e4dcc9", 0, paving);
  box([2.2, .04, 95], [-27.2, -.04, 0], "#d7d9cf", 0, paving);
  for (const [x, z] of PARK_TREES) {
    pole([x, -.12, z], 2.5, .18, "#a68b6d");
    leaf([x, 3.0, z], [1.65, 1.65, 1.5], "#9eb791");
    leaf([x - .85, 2.85, z + .3], [1.1, 1.15, 1.1], "#8ea77f");
    leaf([x + .65, 3.45, z - .25], [1.1, 1.2, 1.1], "#b5c89b");
  }
  for (const x of [-17.2, 17.2]) for (const z of [-12.9, 11.8]) {
    box([1.7, .35, 2.2], [x, .05, z], "#c8d1bb");
    for (const n of [-.45, .45]) leaf([x, .56, z + n], [.78, .6, .75], n < 0 ? "#a0b781" : "#b6c593");
  }
  function bench(x: number, z: number, yaw = 0) {
    const part = (s: Point, p: Point, color: string) => add(new BoxGeometry(...s).translate(...p).rotateY(yaw).translate(x, 0, z), color);
    for (const side of [-1, 1]) part([.12, .60, .7], [side * 1.25, .25, 0], "#6c8487");
    for (const row of [-1, 0, 1]) part([3.5, .09, .22], [0, .59, row * .25], "#c6a675");
    part([3.5, .32, .09], [0, .92, -.38], "#d3b88d");
  }
  bench(-8, 13.5); bench(6, 13.5); bench(17, 3.5, Math.PI / 2); bench(-24, -9);
  // Small shade pavilion outside the interaction footprint.
  for (const dx of [-2.6, 2.6]) for (const dz of [-1.5, 1.5]) pole([-24 + dx, 0, -9 + dz], 2.8, .07, "#a7b6ac");
  add(new ConeGeometry(4.1, 1.05, 4).rotateY(Math.PI / 4).scale(1.05, 1, .7).translate(-24, 3.28, -9), "#ede5ce");
  box([1.2, .75, .75], [-22.3, .38, -9.1], "#a0bdc6");
  box([.40, .42, .40], [-22.3, .98, -9.1], "#d7e9e8");
  // Low open railings: wide gates keep routes visually connected.
  for (const x of [-15.6, 15.6]) for (const z of [-13, -9, 8, 12]) {
    pole([x, 0, z], 1.05, .035, "#98aeb0");
    box([.045, .055, 3.7], [x, .78, z + 1.8], "#acbfc0");
    box([.045, .045, 3.7], [x, .38, z + 1.8], "#b9c9c6");
  }
  for (const x of [-12, -8, 8, 12]) {
    pole([x, 0, -16.8], 1.05, .04, "#98aeb0");
    box([3.8, .055, .05], [x, .78, -16.8], "#acbfc0");
    for (const k of [-1.2, -.4, .4, 1.2]) box([.025, .73, .025], [x + k, .4, -16.8], "#becbc6");
  }
  // Sports lighting is geometry only; sunlight is the one lighting model.
  for (const x of [-17.6, 17.6]) for (const z of [-10.8, 10.8]) {
    pole([x, 0, z], 5.7, .055, "#a9b7b2");
    box([1.2, .16, .30], [x, 5.72, z], "#8d9fa4");
    box([1.0, .035, .28], [x, 5.62, z + .06], "#fff2cc");
  }
  // Quiet skyline beyond the sports ground.
  for (const block of PARK_AMENITIES.filter(a => a.kind === "city")) {
    const { x, z, width, depth, height } = block;
    box([width, height, depth], [x, height / 2 - .15, z], "#bdced0");
    box([width * .74, .7, depth * .74], [x, height + .2, z], "#b4c5c8");
    for (let y = 1.2; y < height; y += 1.2) {
      box([width + .12, .10, depth + .12], [x, y, z], "#d5deda");
      box([width - .3, .50, .02], [x, y + .32, z + depth / 2 + .02], "#a4bec8");
    }
  }
  // Waterfront and a compact white leisure vessel echo the photo's harbour.
  for (let z = -38; z <= 32; z += 5) {
    pole([-28.4, -.08, z], 1.0, .045, "#a6b9ba");
    box([.04, .05, 5], [-28.4, .8, z + 2.5], "#b8cbcc");
  }
  box([4.5, .8, 11], [-35, .18, -24], "#dbe3d7");
  box([3.7, 1.5, 7.2], [-35, 1.22, -24.4], "#eeeada");
  box([2.8, 1.0, 3.6], [-35, 2.4, -25], "#e7e6d9");
  box([3.1, .42, .04], [-35, 1.62, -20.77], "#9fb9c4");
  box([3.4, .15, 7.5], [-35, 2.05, -24.4], "#c6d2cc");
  pole([-35, 2.7, -25], 3.2, .055, "#a9b7b3");
  box([1.8, .055, .08], [-35, 5.6, -25], "#b8c4bf");
  return {
    scenery: painted(props), paving: painted(paving),
    land: new PlaneGeometry(240, 240).rotateX(-Math.PI / 2).translate(0, -.17, 0),
    water: new PlaneGeometry(60, 180).rotateX(-Math.PI / 2).translate(-59, -.15, 0),
  };
}
/** Immutable geometry shared by all views; decorations have no player/court identity. */
export const parkGeometry = createPark();
export const sceneryRaycast = () => {};
