import { describe, expect, it } from "vitest";
import { createEvent, project } from "../../src/modules/competition";
import { playerPlacement, worldLayout, isBenchPoint, benchMarkerPosition } from "../../src/modules/venue/world";
import { angelPose } from "../../src/modules/venue/angel-pose";
import { step } from "../fixtures/event";
describe("free-roster angel presentation", () => {
  it("has an independent bench outside the three playing surfaces", () => {
    const state = createEvent("local-angel", "2026-10-30T00:00:00Z"), layout = worldLayout(390, 844);
    const placement = playerPlacement(state, project(state), "B01", layout);
    expect(placement.onCourt).toBe(false); expect(placement.position[0]).toBeGreaterThan(12);
    expect(isBenchPoint(placement.position, "FREE", layout)).toBe(true); expect(isBenchPoint(benchMarkerPosition("WHITE"), "FREE", layout)).toBe(false);
    expect(new Set(state.players.map(p => playerPlacement(state, project(state), p.id, layout).position.join())).size).toBe(13);
  });
  it.each(["WHITE", "BLACK"] as const)("faces the real %s side independently of the roster group", side => {
    let state = step(createEvent("local-angel-side", "2026-10-30T00:00:00Z"), { type: "OpenFirstRound" });
    state = step(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side}-1`, playerId: "B01" });
    const placed = playerPlacement(state, project(state), "B01", worldLayout(390, 844));
    expect(placed.sideId).toBe(side); expect(placed.facing).toBe(side === "WHITE" ? Math.PI : 0);
  });
  it("flies above the ground with folded legs and has a static reduced-motion pose", () => {
    const idle = angelPose(0, false, false), flight = angelPose(0, true, false);
    expect(flight.lift).toBeGreaterThan(idle.lift); expect(flight.leg).toBeLessThan(0);
    expect(angelPose(1, true, false).wing).not.toBe(flight.wing);
    expect(angelPose(1, true, true)).toEqual(angelPose(10, true, true));
  });
});
