import { describe, expect, it } from "vitest";
import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { BOARD_SIZE, MAX_PITCH, MAX_ZOOM, MIN_PITCH, MIN_ZOOM, boardCenter, cameraView, constrainNavigation, courtCenter, courtNavigation, frameOverview, orbitNavigation, overview, worldLayout, type Navigation, type Point } from "../../src/modules/venue/world";

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
  it("bounds zoom and pan without unexpectedly resetting the pivot", () => {
    const layout = worldLayout(390, 844);
    const far = constrainNavigation({ ...overview(layout), zoom: 0.1, center: [2, 0, 3] }, layout);
    expect(far.zoom).toBe(MIN_ZOOM); expect(far.center).toEqual([2, 0, 3]);
    const close = constrainNavigation({ ...overview(layout), zoom: 20, center: [999, 0, -999] }, layout);
    expect(close.zoom).toBe(MAX_ZOOM);
    expect(close.center[0]).toBeLessThanOrEqual(layout.width / 2);
    expect(close.center[2]).toBeGreaterThanOrEqual(-layout.length / 2);
  });
});

describe("touch orbit and camera projection", () => {
  it("rotates freely above the floor without moving the venue or its focus", () => {
    const layout = worldLayout(390, 844), initial = overview(layout);
    const positions = [1, 2, 3].map(n => courtCenter(n, layout));
    const rotated = orbitNavigation(initial, 844 * 2, -844 * 5, 844);
    expect(rotated.yaw).toBeLessThan(initial.yaw - Math.PI * 2);
    expect(rotated.pitch).toBe(MAX_PITCH);
    expect(rotated.center).toEqual(initial.center);
    expect(orbitNavigation(initial, 0, 844 * 5, 844).pitch).toBe(MIN_PITCH);
    expect([1, 2, 3].map(n => courtCenter(n, layout))).toEqual(positions);
    expect(cameraView(rotated, layout).offset[1]).toBeGreaterThan(0);
  });
  it.each([[320, 568], [390, 844], [1280, 720]])("frames all three courts on an explicit overview request at %i×%i", (width, height) => {
    const layout = worldLayout(width, height);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const pitch of [MIN_PITCH, MAX_PITCH]) {
        const nav = frameOverview(layout, { yaw, pitch }), view = cameraView(nav, layout);
        const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 180);
        camera.position.copy(new Vector3(...nav.center).add(new Vector3(...view.offset)));
        camera.lookAt(...nav.center); camera.zoom = view.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        for (const number of [1, 2, 3]) {
          const center = new Vector3(...courtCenter(number, layout)).project(camera);
          expect(Math.abs(center.x)).toBeLessThan(1);
          expect(Math.abs(center.y)).toBeLessThan(1);
        }
        const focused = courtNavigation(2, layout, nav);
        expect(focused.yaw).toBe(yaw); expect(focused.pitch).toBe(pitch);
        expect(focused.zoom).toBeGreaterThan(MIN_ZOOM);
        expect(focused.center).not.toEqual(nav.center);
      }
    }
  });
  it("allows a two-finger pan at overview scale and preserves direction when zooming out", () => {
    const layout = worldLayout(390, 844), nav = { ...overview(layout), yaw: 1, center: [2, 0, 3] as Point };
    expect(constrainNavigation(nav, layout).center).toEqual([2, 0, 3]);
    const home = constrainNavigation({ ...nav, zoom: 0.8 }, layout);
    expect(home.center).toEqual(nav.center); expect(home.yaw).toBe(1); expect(home.zoom).toBe(0.8);
  });
  it("maps a rotated and panned court position back to the same world point", () => {
    const layout = worldLayout(390, 844), nav = { ...overview(layout), yaw: -1.3, pitch: 1.1, center: [1, 0.2, -3] as Point, zoom: 2.2 };
    const view = cameraView(nav, layout), camera = new OrthographicCamera(-195, 195, 422, -422, 0.1, 180);
    camera.position.copy(new Vector3(...nav.center).add(new Vector3(...view.offset)));
    camera.lookAt(...nav.center); camera.zoom = view.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const point = new Vector3(1.5, 0.1, -3.15), screen = point.clone().project(camera), ray = new Raycaster();
    ray.setFromCamera(new Vector2(screen.x, screen.y), camera);
    const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -0.1), new Vector3());
    expect(hit?.distanceTo(point)).toBeLessThan(0.00001);
  });
  it("keeps the focused scoreboard reachable after a quarter turn", () => {
    const width = 390, height = 844, layout = worldLayout(width, height);
    const nav = courtNavigation(2, layout, { ...overview(layout), yaw: Math.PI / 2, pitch: MIN_PITCH });
    const view = cameraView(nav, layout), camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 180);
    camera.position.copy(new Vector3(...nav.center).add(new Vector3(...view.offset)));
    camera.lookAt(...nav.center); camera.zoom = view.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const point = new Vector3(...boardCenter(2, layout)).project(camera);
    const x = (point.x + 1) * width / 2;
    expect(x - BOARD_SIZE.frameWidth * 1.3 / 2).toBeGreaterThanOrEqual(16);
    expect(x + BOARD_SIZE.frameWidth * 1.3 / 2).toBeLessThanOrEqual(width - 16);
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
    const positions: Navigation[] = [overview(layout), ...[1, 2, 3].map(n => courtNavigation(n, layout)), { ...overview(layout), center: [0, 0, 0], zoom: 3 }];
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
