import { describe, expect, it } from "vitest";
import { Color } from "three";
import { PARK_AMENITIES, parkGeometry, sceneryRaycast } from "../../src/modules/venue/park-model";
import { COURT_PALETTE, PARK_TREES, sunlitMaterial } from "../../src/modules/venue/sunlight";
describe("static sunshine sports park", () => {
  it("keeps raised decorative geometry out of the complete court, roster and scoreboard footprint", () => {
    const p = parkGeometry.scenery.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i))).toBe(true);
      expect(Math.abs(p.getX(i)) > 14.5 || p.getZ(i) < -15.7 || p.getZ(i) > 10.7).toBe(true);
    }
    for (const item of PARK_AMENITIES) expect(Math.abs(item.x) - item.width / 2 > 14.5 || item.z - item.depth / 2 > 10.7 || item.z + item.depth / 2 < -15.7).toBe(true);
    expect(PARK_TREES).toHaveLength(8);
    expect(sceneryRaycast()).toBeUndefined();
  });
  it("uses only four reusable environment meshes within a modest geometry budget", () => {
    let triangles = 0;
    for (const g of Object.values(parkGeometry)) {
      triangles += (g.index?.count ?? g.getAttribute("position").count) / 3;
      expect(g.groups).toHaveLength(0);
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
    }
    expect(triangles).toBeLessThan(12000);
    expect(Object.keys(parkGeometry)).toHaveLength(4);
  });
  it("caches separately owned surface variants without changing palette uniforms or adding textures", () => {
    const floor = sunlitMaterial("#e7dfc9", { tiles: true });
    expect(sunlitMaterial("#e7dfc9", { tiles: true })).toBe(floor);
    const before = floor.uniforms.uBase.value.clone();
    const court = sunlitMaterial(COURT_PALETTE.play), scenery = sunlitMaterial("#ffffff", { vertexColors: true });
    expect(floor).not.toBe(court); expect(scenery.vertexColors).toBe(true);
    expect(floor.uniforms.uBase.value.equals(before)).toBe(true);
    expect(court.uniforms.uBase.value.equals(new Color(COURT_PALETTE.play))).toBe(true);
    expect(floor.uniforms.uCanopies.value).toHaveLength(8);
    expect(floor.transparent).toBe(false);
  });
});
