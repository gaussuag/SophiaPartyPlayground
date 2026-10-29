import { describe, expect, it } from "vitest";
import { boardCenter, constrainNavigation, courtCenter, courtNavigation, worldLayout } from "../../src/modules/venue/world";

describe("continuous three-court world", () => {
  it.each([[390, 844], [320, 568], [1440, 900]])("keeps distinct court and scoreboard positions while navigating %i×%i", (width, height) => {
    const layout = worldLayout(width, height);
    const before = [1, 2, 3].map(n => ({ court: courtCenter(n, layout), board: boardCenter(n, layout) }));
    for (const number of [1, 2, 3]) {
      const nav = courtNavigation(number, layout);
      expect(nav.zoom).toBeGreaterThan(1);
      expect(nav.center).toEqual(before[number - 1].court);
      expect([1, 2, 3].map(n => ({ court: courtCenter(n, layout), board: boardCenter(n, layout) }))).toEqual(before);
    }
    expect(new Set(before.map(p => p.court.join(","))).size).toBe(3);
  });
  it("returns to the complete world at minimum zoom and bounds panning", () => {
    const layout = worldLayout(390, 844);
    expect(constrainNavigation({ zoom: 0.5, center: [999, 0, -999] }, layout)).toEqual({ zoom: 1, center: [0, 0, 0] });
    const close = constrainNavigation({ zoom: 20, center: [999, 0, -999] }, layout);
    expect(close.zoom).toBe(3);
    expect(close.center[0]).toBeLessThanOrEqual(layout.width / 2);
    expect(close.center[2]).toBeGreaterThanOrEqual(-layout.length / 2);
  });
});
