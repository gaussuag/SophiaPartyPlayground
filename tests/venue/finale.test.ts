import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { createEvent, project } from "../../src/modules/competition";
import { finishedCup } from "../fixtures/finished-cup";
import { planFinale, sampleFinale, angelFinale, confettiPose, FINALE_CONFETTI_COUNT, COMPLETION_COLUMN_X } from "../../src/modules/venue/finale";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { AvatarPlacements } from "../../src/modules/venue/avatar-placements";
import { worldLayout, completionNavigation, cameraView } from "../../src/modules/venue/world";
const layout = worldLayout(390, 844);
describe("result-driven completion procession", () => {
  it("unlocks only after completion and queues the actual teams face to face without changing records", () => {
    expect(planFinale(createEvent("local-no-finale", "2026-10-31T00:00:00Z"))).toBeUndefined();
    const state = finishedCup(), before = JSON.stringify(state), plan = planFinale(state)!;
    expect(plan.winner).toBe("WHITE"); expect(Object.keys(plan.placements)).toHaveLength(state.players.length); expect(plan.angel).toBe("B01");
    for (const team of ["WHITE", "BLACK"] as const) {
      const positions = state.players.filter(p => p.teamId === team).map(p => plan.placements[p.id]);
      expect(new Set(positions.map(p => p.position[0])).size).toBe(1);
      expect(Math.abs(positions[0].position[0])).toBe(COMPLETION_COLUMN_X);
      for (let i = 1; i < positions.length; i++) expect(positions[i].position[2] - positions[i - 1].position[2]).toBeGreaterThan(3);
      expect(Math.sign(Math.sin(positions[0].facing))).toBe(team === "WHITE" ? 1 : -1);
    }
    for (let i = 0; i < 600; i++) expect(sampleFinale(plan, i / 30).balls).toHaveLength(0);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("keeps Sophia in the central corridor, smoothly rises, and emits bounded ribbons", () => {
    expect(FINALE_CONFETTI_COUNT).toBe(112);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 1200; i++) {
      const p = angelFinale(i / 30); expect(Math.abs(p.offset[0])).toBeLessThanOrEqual(.65); expect(Math.abs(p.offset[2])).toBeLessThanOrEqual(8);
      min = Math.min(min, p.offset[2]); max = Math.max(max, p.offset[2]);
      if (i) expect(Math.hypot(...p.offset.map((v, n) => v - angelFinale((i - 1) / 30).offset[n]))).toBeLessThan(.15);
    }
    expect(min).toBeLessThan(-7.9); expect(max).toBeGreaterThan(7.9);
    for (let i = 0; i < 112; i++) expect(confettiPose(8.12, i).position.every(Number.isFinite)).toBe(true);
  });
  it.each([[320, 568], [390, 664], [393, 852], [402, 874], [430, 932], [1280, 720]])("frames both queues inside the usable viewport at %ix%i", (width, height) => {
    const layout = worldLayout(width, height), nav = completionNavigation(layout), pose = cameraView(nav, layout);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 180);
    camera.position.set(...nav.center.map((v, i) => v + pose.offset[i]) as [number, number, number]); camera.lookAt(new Vector3(...nav.center)); camera.zoom = pose.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const plan = planFinale(finishedCup())!;
    for (let tick = 0; tick < 600; tick++) {
      const flight = angelFinale(tick / 15), head = new Vector3(flight.offset[0], .18 + (flight.lift + 1.5) * 1.55, flight.offset[2]).project(camera);
      expect((1 - head.y) * height / 2).toBeGreaterThan(195);
      expect((1 - head.y) * height / 2).toBeLessThan(height - 110);
    }
    for (const team of ["WHITE", "BLACK"] as const) {
      const points = Object.entries(plan.placements).filter(([id]) => id !== plan.angel).filter(([, p]) => p.sideId === team).map(([, p]) => {
        const projected = new Vector3(...p.position).project(camera); return [(projected.x + 1) * width / 2, (1 - projected.y) * height / 2];
      });
      for (const [x, y] of points) { expect(x).toBeGreaterThan(24); expect(x).toBeLessThan(width - 24); expect(y).toBeGreaterThan(190); expect(y).toBeLessThan(height - 110); }
      for (let i = 1; i < points.length; i++) expect(Math.abs(points[i][1] - points[i - 1][1])).toBeGreaterThan(28);
    }
  });
  it("replays locally, pauses and clears all effects when returning to a real round", () => {
    const state = finishedCup(), view = project(state), plan = planFinale(state)!, positions = new AvatarPlacements(), c = new LocalChoreography(11);
    positions.present(state, plan); c.sync(state, view, layout, positions, plan); c.configure(true, false);
    for (let i = 0; i < 180; i++) c.step(1 / 60); expect(c.finaleClock).toBeGreaterThan(2); expect(c.balls).toHaveLength(0);
    const time = c.finaleClock; c.configure(false, false); c.step(1); expect(c.finaleClock).toBe(time);
    c.configure(true, true); c.step(1); expect(c.finaleClock).toBe(time); expect(c.balls).toHaveLength(0);
    c.configure(true, false); c.replayFinale(); expect(c.finaleClock).toBe(0); c.step(.05); expect(c.finaleClock).toBe(.05);
    positions.sync(state, project(state, { roundId: "R01" }), layout); c.sync(state, project(state, { roundId: "R01" }), layout, positions); c.step(.05); expect(c.finale).toBeUndefined(); expect(c.balls).toHaveLength(0);
  });
});
