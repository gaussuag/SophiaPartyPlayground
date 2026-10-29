import { describe, expect, it } from "vitest";
import { CameraMotion } from "../../src/modules/venue/camera-motion";
import { VenueInput, type InputContext } from "../../src/modules/venue/venue-input";
import { cameraView, MAX_PITCH, MIN_PITCH, overview, worldLayout } from "../../src/modules/venue/world";

function harness(editable = true) {
  const layout = worldLayout(390, 844), motion = new CameraMotion(overview(layout));
  let context: InputContext = { layout, bounds: { left: 0, top: 0, width: 390, height: 844 }, editable, disabled: false, basis: { revision: 3, generation: 1 } };
  const events: { type: string; id?: string; x?: number; y?: number }[] = [];
  const input = new VenueInput(motion, () => context, {
    invalidate() {}, capture() {}, release() {},
    activity(mode, playerId) { events.push({ type: mode, id: playerId }); },
    select(id) { events.push({ type: "select", id }); },
    drag(id, x, y) { events.push({ type: "drag", id, x, y }); },
    drop(id, x, y) { events.push({ type: "drop", id, x, y }); },
    settled() {},
  });
  return { input, motion, layout, events, resize: (height: number) => { context = { ...context, layout: worldLayout(390, height), bounds: { ...context.bounds, height } }; } };
}
const p = (id: number, x: number, y: number) => ({ id, x, y });

describe("venue pointer trajectories (the DOM/R3F gesture owner)", () => {
  it.each([1, -1])("reverses immediately after excess travel at pitch boundary %s", direction => {
    const { input, motion } = harness();
    input.down(p(1, 30, 300));
    input.move(p(1, 30, 300 + direction * 240));
    expect(motion.value.pitch).toBe(direction > 0 ? MIN_PITCH : MAX_PITCH);
    input.move(p(1, 30, 300 + direction * 400));
    input.move(p(1, 30, 300 + direction * 399));
    expect(direction > 0 ? motion.value.pitch > MIN_PITCH : motion.value.pitch < MAX_PITCH).toBe(true);
  });
  it("responds on first pixel, consumes pointerup, and stays still after release", () => {
    const { input, motion, layout } = harness(), start = motion.snapshot();
    input.down(p(1, 10, 400)); input.move(p(1, 11, 400));
    expect(motion.value.yaw).not.toBe(start.yaw);
    input.up(p(1, 30, 400));
    const end = motion.snapshot();
    expect(end.yaw).toBeCloseTo(start.yaw - 20 * Math.PI * 2 * .65 / 844, 10);
    for (let n = 0; n < 120; n++) motion.step(1 / 60);
    expect(motion.snapshot()).toEqual(end);
    expect(end.center).toEqual(start.center);
    expect(cameraView(end, layout).zoom).toEqual(cameraView(start, layout).zoom);
    expect(Math.hypot(...cameraView(end, layout).offset)).toEqual(Math.hypot(...cameraView(start, layout).offset));
    expect(input.suppressClick).toBe(true);
  });
  it("takes over the displayed transition pose immediately on pointerdown", () => {
    const { input, motion } = harness();
    motion.move({ ...motion.snapshot(), yaw: 2, zoom: 2 }); motion.step(1 / 60);
    const shown = motion.snapshot(); input.down(p(1, 30, 300));
    motion.step(1 / 60); expect(motion.snapshot()).toEqual(shown);
    expect(motion.moving).toBe(false);
  });
  it("freezes sensitivity and bounds for the entire gesture through a resize", () => {
    const { input, motion, resize } = harness(), start = motion.snapshot();
    input.down(p(1, 20, 400)); input.move(p(1, 30, 400)); resize(600);
    input.move(p(1, 40, 400)); input.up(p(1, 40, 400));
    expect(motion.value.yaw).toBeCloseTo(start.yaw - 20 * Math.PI * 2 * .65 / 844, 10);
  });
  it("preserves direct person drag and stable identity while dropping once", () => {
    const { input, events } = harness();
    input.down(p(1, 20, 400), { playerId: "W01" });
    input.move(p(1, 40, 400)); input.up(p(1, 80, 450)); input.up(p(1, 80, 450));
    expect(events.filter(e => e.type === "drop")).toEqual([{ type: "drop", id: "W01", x: 80, y: 450 }]);
    expect(events.filter(e => e.type === "select")).toHaveLength(0);
  });
  it("lets readonly person/body/name slides rotate, and taps still select", () => {
    const { input, motion, events } = harness(false), start = motion.snapshot();
    input.down(p(1, 20, 400), { playerId: "W01" }); input.move(p(1, 60, 400)); input.up(p(1, 60, 400));
    expect(motion.value.yaw).not.toBe(start.yaw); expect(events.filter(e => e.type === "select")).toHaveLength(0);
    input.down(p(2, 20, 400), { playerId: "W01" }); input.up(p(2, 20, 400));
    expect(events.filter(e => e.type === "select")).toEqual([{ type: "select", id: "W01" }]);
  });
  it.each([1, 2])("second finger cancels person and either lift order %s cannot submit", first => {
    const { input, motion, events } = harness();
    input.down(p(1, 50, 300), { playerId: "W01" }); input.move(p(1, 70, 300));
    input.down(p(2, 200, 300), { ui: true }); input.move(p(2, 230, 310));
    input.up(p(first, first === 1 ? 70 : 230, first === 1 ? 300 : 310));
    const shown = motion.snapshot(), second = first === 1 ? 2 : 1;
    input.move(p(second, 260, 350)); input.up(p(second, 280, 360));
    expect(motion.snapshot()).toEqual(shown);
    expect(events.filter(e => e.type === "drop" || e.type === "select")).toHaveLength(0);
    expect(input.suppressClick).toBe(true);
  });
  it("rebuilds two-finger baseline from latest input before the next render", () => {
    const { input, motion } = harness();
    input.down(p(1, 30, 400)); input.move(p(1, 60, 450));
    const shown = motion.snapshot(); input.down(p(2, 200, 450));
    input.move(p(2, 200, 450)); expect(motion.snapshot()).toEqual(shown);
    input.move(p(2, 220, 450)); expect(motion.value.zoom).toBeCloseTo(shown.zoom * 160 / 140, 9);
  });
  it("zoom limit consumes excess distance so reversing changes scale immediately", () => {
    const { input, motion } = harness();
    input.down(p(1, 20, 400)); input.down(p(2, 40, 400));
    input.move(p(2, 240, 400)); expect(motion.value.zoom).toBe(5);
    input.move(p(2, 230, 400)); expect(motion.value.zoom).toBeLessThan(5);
  });
  it("cancel, lost capture and background use the same no-submit exit", () => {
    const { input, events } = harness();
    input.down(p(1, 20, 400), { playerId: "W01" }); input.move(p(1, 40, 400)); input.cancel(); input.up(p(1, 90, 450));
    expect(events.filter(e => e.type === "drop" || e.type === "select")).toHaveLength(0);
    expect(input.active).toBe(false); expect(input.suppressClick).toBe(true);
  });
  it("a third finger and alternating lifts never resurrect a cancelled character", () => {
    const { input, events } = harness();
    input.down(p(1, 20, 400), { playerId: "W01" }); input.down(p(2, 100, 400)); input.down(p(3, 180, 400));
    input.up(p(1, 20, 400)); input.move(p(3, 200, 400)); input.up(p(2, 100, 400)); input.up(p(3, 200, 400));
    expect(events.filter(e => e.type === "drop" || e.type === "select")).toHaveLength(0);
  });
});
