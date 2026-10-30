import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { PLAY_IDS, PlayTap, ScenePlayController, playPose, playPositions } from "../../src/modules/venue/scene-play";
import { cameraView, courtCenter, overview, worldLayout } from "../../src/modules/venue/world";

describe("local scene activities", () => {
  it.each([[320, 568], [390, 600], [390, 844]])("leaves all three 48×44 toy buttons clear of each other and the bottom dock at %i×%i", (width, height) => {
    const layout = worldLayout(width, height), nav = overview(layout), view = cameraView(nav, layout);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 180);
    camera.position.copy(new Vector3(...nav.center).add(new Vector3(...view.offset)));
    camera.lookAt(...nav.center); camera.zoom = view.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const centers = Object.values(playPositions(layout)).map(([x, y, z]) => {
      const p = new Vector3(x, y + .1, z + 1.15).project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
    });
    for (const [index, point] of centers.entries()) {
      expect(point.x - 24).toBeGreaterThan(0); expect(point.x + 24).toBeLessThan(width);
      expect(point.y + 22).toBeLessThan(height - 66);
      if (index) expect(point.x - centers[index - 1].x).toBeGreaterThanOrEqual(48);
    }
  });
  it("plays a ball or greeting once, ignores repeated taps during it, and returns exactly to rest", () => {
    const controller = new ScenePlayController();
    expect(controller.activate("ball", 100)).toBe(true);
    expect(controller.activate("ball", 200)).toBe(false);
    expect(controller.nextDeadline).toBe(2800);
    expect(playPose(controller, 600, false).ballY).toBeGreaterThan(0.35);
    controller.advance(2800);
    expect(controller.active).toBe(false);
    expect(playPose(controller, 2800, false).ballY).toBe(0.35);
    expect(playPose(controller, 2800, false).ballX).toBe(0);
    expect(controller.activate("mascot", 3000)).toBe(true);
    expect(controller.activate("mascot", 3100)).toBe(false);
    expect(playPose(controller, 3500, false).wave).not.toBe(0);
    controller.advance(5300);
    expect(playPose(controller, 5300, false).wave).toBe(0);
    expect(controller.activate("ball", 5500)).toBe(true);
  });

  it("toggles the fan and stops unattended operation after ten seconds", () => {
    const controller = new ScenePlayController();
    controller.activate("fan", 0);
    expect(controller.getSnapshot().fan).toBe(true);
    expect(playPose(controller, 1000, false).fanTurn).toBeGreaterThan(0);
    controller.activate("fan", 1200);
    expect(controller.getSnapshot().fan).toBe(false);
    expect(playPose(controller, 1200, false).fanTurn).toBe(0);
    controller.activate("fan", 1500);
    controller.advance(11499);
    expect(controller.getSnapshot().fan).toBe(true);
    controller.advance(11500);
    expect(controller.getSnapshot().fan).toBe(false);
  });

  it("keeps the three activities independent and publishes only state transitions", () => {
    const controller = new ScenePlayController();
    let transitions = 0;
    const unsubscribe = controller.subscribe(() => transitions++);
    for (const id of PLAY_IDS) controller.activate(id, 100);
    const initial = controller.getSnapshot();
    for (let now = 200; now < 2000; now += 16) { controller.advance(now); playPose(controller, now, false); }
    expect(transitions).toBe(3);
    expect(controller.getSnapshot()).toBe(initial);
    controller.advance(2400);
    expect(controller.getSnapshot()).toEqual({ ball: true, mascot: false, fan: true });
    controller.advance(2800);
    expect(controller.getSnapshot()).toEqual({ ball: false, mascot: false, fan: true });
    unsubscribe(); controller.cancel();
    expect(transitions).toBe(5);
  });

  it("cancels all active toys for background, teardown, and scene recovery", () => {
    const controller = new ScenePlayController();
    PLAY_IDS.forEach(id => controller.activate(id, 100));
    controller.cancel(); controller.cancel();
    expect(controller.active).toBe(false);
    expect(controller.nextDeadline).toBe(Infinity);
    expect(controller.getSnapshot()).toEqual({ ball: false, mascot: false, fan: false });
    expect(playPose(controller, 5000, false)).toEqual(playPose(new ScenePlayController(), 5000, false));
  });

  it("provides stable visible feedback with reduced motion and expires without needing frames", () => {
    const controller = new ScenePlayController();
    PLAY_IDS.forEach(id => controller.activate(id, 0));
    const first = playPose(controller, 100, true), later = playPose(controller, 500, true);
    expect(first).toEqual(later);
    expect(first.wave).not.toBe(0);
    expect(first.ballY).toBe(0.35);
    expect(first.fanTurn).toBe(0);
    expect(controller.getSnapshot()).toEqual({ ball: true, mascot: true, fan: true });
    controller.advance(10000); // The component's single deadline timer can drive this.
    expect(controller.active).toBe(false);
  });

  it.each([[390, 844], [320, 568], [1440, 900]])("keeps toy roots outside every court and player aisle at %i×%i", (width, height) => {
    const layout = worldLayout(width, height), positions = playPositions(layout);
    for (const position of Object.values(positions)) {
      for (const number of [1, 2, 3]) {
        const court = courtCenter(number, layout);
        expect(Math.abs(position[0] - court[0]) > 3.6 || Math.abs(position[2] - court[2]) > 6).toBe(true);
      }
      expect(Math.abs(position[0]) + 0.8).toBeLessThan(layout.width / 2);
      expect(position[2] + 0.8).toBeLessThanOrEqual(layout.floorCenterZ + layout.length / 2 + 0.2);
    }
  });
});

describe("toy tap arbitration", () => {
  it("accepts a short tap once, including small hand jitter", () => {
    const tap = new PlayTap();
    tap.down(1, 100, 100); tap.move(1, 103, 102); tap.up(1, 102, 101);
    tap.lost(1); // Normal implicit capture release follows pointerup on touch.
    expect(tap.consume(102, 101)).toBe(true);
    expect(tap.consume(102, 101)).toBe(false);
  });
  it("rejects a swipe even when the finger comes back to its start", () => {
    const tap = new PlayTap();
    tap.down(1, 100, 100); tap.move(1, 130, 100); tap.move(1, 100, 100); tap.up(1, 100, 100);
    expect(tap.consume(100, 100)).toBe(false);
  });
  it("uses the release position and rejects cancel or a second finger", () => {
    const tap = new PlayTap();
    tap.down(1, 100, 100); tap.up(1, 140, 100);
    expect(tap.consume(140, 100)).toBe(false);
    tap.down(1, 100, 100); tap.cancel();
    expect(tap.consume(100, 100)).toBe(false);
    tap.down(1, 100, 100); tap.lost(1);
    expect(tap.consume(100, 100)).toBe(false);
    tap.down(1, 100, 100); tap.down(2, 100, 120); tap.up(2, 100, 120); tap.up(1, 100, 100);
    expect(tap.consume(100, 100)).toBe(false);
    tap.down(3, 100, 100); tap.up(3, 100, 100);
    expect(tap.consume(100, 100)).toBe(true);
  });
});
