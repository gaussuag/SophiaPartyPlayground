import { describe, expect, it } from "vitest";
import { cameraView, orbitNavigation, overview, worldLayout } from "../../src/modules/venue/world";
import { CameraMotion } from "../../src/modules/venue/camera-motion";

describe("direct camera manipulation", () => {
  it("does not zoom or move the pivot while a finger only rotates", () => {
    const layout = worldLayout(390, 844), start = overview(layout);
    const zoom = cameraView(start, layout).zoom;
    for (const dx of [1, 4, 10, 25, 60, 120]) {
      const pose = orbitNavigation(start, dx, 0, 844);
      expect(pose.center).toEqual(start.center);
      expect(pose.zoom).toBe(start.zoom);
      expect(cameraView(pose, layout).zoom, `pure rotation at ${dx}px must not dolly`).toBeCloseTo(zoom, 8);
    }
  });
  it("responds to a one-pixel movement directly and stops when the finger stops", () => {
    const start = overview(worldLayout(390, 844)), motion = new CameraMotion(start);
    const next = orbitNavigation(start, 1, 0, 844);
    motion.move(next, true);
    expect(motion.value.yaw).not.toBe(start.yaw); expect(motion.snapshot()).toEqual(next);
    for (let n = 0; n < 60; n++) expect(motion.step(1 / 60)).toBe(false);
    expect(motion.snapshot()).toEqual(next);
  });
  it("keeps the orbit radius constant through a smooth focus transition", () => {
    const layout = worldLayout(390, 844), start = overview(layout), motion = new CameraMotion(start);
    motion.move({ ...start, yaw: start.yaw + Math.PI * 0.8, pitch: 1.1 });
    for (let n = 0; n < 60; n++) {
      motion.step(1 / 60);
      expect(Math.hypot(...cameraView(motion.value, layout).offset)).toBeCloseTo(Math.hypot(...layout.cameraOffset), 8);
    }
  });
  it("takes the short arc across the angle seam", () => {
    const start = { ...overview(), yaw: Math.PI - 0.02 }, motion = new CameraMotion(start);
    motion.move({ ...start, yaw: -Math.PI + 0.02 }); motion.step(1 / 60);
    expect(motion.value.yaw).toBeGreaterThan(start.yaw);
  });
  it("makes focus transitions independent of 30, 60 and 120 Hz frame rates", () => {
    const start = overview(), target = { ...start, yaw: 1, pitch: 1.1, zoom: 2.2 };
    const at = (hz: number) => { const m = new CameraMotion(start); m.move(target); for (let n = 0; n < hz / 2; n++) m.step(1 / hz); return m.snapshot(); };
    expect(at(30).yaw).toBeCloseTo(at(60).yaw, 10); expect(at(60).zoom).toBeCloseTo(at(120).zoom, 10);
  });
  it("preserves the prior view through editor resize or scene reconstruction", () => {
    const start = overview(), m = new CameraMotion(start);
    m.openEditor({ ...start, zoom: 1.8, center: [1, 2, 3] }); m.step(1, true);
    m.openEditor({ ...m.beforeEditor, zoom: 1.8, center: [1, 4, 3] }); m.step(1, true);
    m.closeEditor(); m.step(1, true); expect(m.snapshot()).toEqual(start);
  });
});
