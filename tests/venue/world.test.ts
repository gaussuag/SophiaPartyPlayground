import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { BOARD_SIZE, boardCenter, constrainNavigation, courtCenter, courtNavigation, overview, worldLayout, type Navigation, type Point } from "../../src/modules/venue/world";

describe("continuous three-court world", () => {
  it.each([[390, 844], [320, 568], [1440, 900]])("keeps distinct court and scoreboard positions while navigating %i×%i", (width, height) => {
    const layout = worldLayout(width, height);
    const before = [1, 2, 3].map(n => ({ court: courtCenter(n, layout), board: boardCenter(n, layout) }));
    for (const number of [1, 2, 3]) {
      const nav = courtNavigation(number, layout);
      expect(nav.zoom).toBeGreaterThan(1);
      expect(constrainNavigation(nav, layout)).toEqual(nav);
      expect([1, 2, 3].map(n => ({ court: courtCenter(n, layout), board: boardCenter(n, layout) }))).toEqual(before);
    }
    expect(new Set(before.map(p => p.court.join(","))).size).toBe(3);
  });
  it("returns to the complete world at minimum zoom and bounds panning", () => {
    const layout = worldLayout(390, 844);
    expect(constrainNavigation({ zoom: 0.5, center: [999, 0, -999] }, layout)).toEqual(overview(layout));
    const close = constrainNavigation({ zoom: 20, center: [999, 0, -999] }, layout);
    expect(close.zoom).toBe(3);
    expect(close.center[0]).toBeLessThanOrEqual(layout.width / 2);
    expect(close.center[2]).toBeGreaterThanOrEqual(-layout.length / 2);
  });
});

type ScreenPoint = [number, number];
function overlaps(a: ScreenPoint[], b: ScreenPoint[]) {
  return [a, b].every(polygon => polygon.every((p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    const axis: ScreenPoint = [p[1] - next[1], next[0] - p[0]];
    const interval = (points: ScreenPoint[]) => points.map(v => v[0] * axis[0] + v[1] * axis[1]);
    const aa = interval(a), bb = interval(b);
    return Math.max(...aa) > Math.min(...bb) && Math.max(...bb) > Math.min(...aa);
  }));
}

describe("courtside scoreboard clearance", () => {
  it.each([[1385, 892], [1440, 900], [960, 600], [390, 844], [320, 568]])("keeps every sign off every playing surface at %i×%i", (width, height) => {
    const layout = worldLayout(width, height);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 180);
    const project = (point: Point): ScreenPoint => {
      const p = new Vector3(...point).project(camera);
      return [(p.x + 1) * width / 2, (1 - p.y) * height / 2];
    };
    const positions: Navigation[] = [overview(layout), ...[1, 2, 3].map(n => courtNavigation(n, layout)), { center: [0, 0, 0], zoom: 3 }];
    for (const nav of positions) {
      camera.position.copy(new Vector3(...nav.center).add(new Vector3(...layout.cameraOffset)));
      camera.lookAt(...nav.center); camera.zoom = layout.baseZoom * nav.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const scale = Math.min(1.3, nav.zoom, (width - 24) / BOARD_SIZE.frameWidth);
      const courts = [1, 2, 3].map(n => {
        const center = courtCenter(n, layout);
        return ([[-2.9, -5.35], [2.9, -5.35], [2.9, 5.35], [-2.9, 5.35]]).map(([x, z]) => project([center[0] + x, center[1], center[2] + z]));
      });
      for (const number of [1, 2, 3]) {
        const [x, y] = project(boardCenter(number, layout));
        const w = BOARD_SIZE.frameWidth * scale / 2, h = BOARD_SIZE.frameHeight * scale / 2;
        const sign: ScreenPoint[] = [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
        for (const court of courts) expect(overlaps(sign, court), `sign ${number}, zoom ${nav.zoom}`).toBe(false);
        if (nav === positions[0]) { expect(y - h).toBeGreaterThan(56); expect(y + h).toBeLessThan(height - 76); }
        if (nav === positions[number]) { expect(y - h).toBeGreaterThan(68); expect(y + h).toBeLessThan(height - 76); }
      }
    }
  });
});
