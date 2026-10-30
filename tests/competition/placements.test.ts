import { describe, expect, it } from "vitest";
import { placementCommand, placementTargets } from "../../app/placements";
import { project } from "../../src/modules/competition";
import { complete, readyForRound, step } from "../fixtures/event";

describe("scene placement targets", () => {
  it("maps a person to real legal court positions without changing a snapshot", () => {
    const state = readyForRound(1); const before = JSON.stringify(state);
    const targets = placementTargets(state, project(state), "W01");
    expect(targets.filter(t => t.allowed).map(t => [t.matchId, t.slotId])).toEqual([
      ["M-R01-C01", "WHITE-1"], ["M-R01-C02", "WHITE-1"], ["M-R01-C03", "WHITE-1"], ["M-R01-C03", "WHITE-2"],
    ]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("keeps the picked match/slot and rejects a gesture based on an old revision", () => {
    const state = readyForRound(1); const target = placementTargets(state, project(state), "W01").find(t => t.allowed)!;
    const basis = { revision: state.revision, generation: state.generation };
    expect(placementCommand(state, target, "W01", basis)).toEqual({ type: "AssignPlayer", playerId: "W01", matchId: "M-R01-C01", slotId: "WHITE-1" });
    const newer = step(state, { type: "AssignPlayer", playerId: "B02", matchId: "M-R01-C02", slotId: "BLACK-1" });
    expect(placementCommand(newer, target, "W01", basis)).toBeNull();
    expect(placementCommand(state, target, "W01", { ...basis, generation: basis.generation + 1 })).toBeNull();
  });
  it("offers an atomic move for a reservation on another preparing court", () => {
    let state = readyForRound(1); state = step(state, { type: "AssignPlayer", playerId: "W01", matchId: "M-R01-C01", slotId: "WHITE-1" });
    const targets = placementTargets(state, project(state), "W01");
    const target = targets.find(t => t.matchId === "M-R01-C02" && t.slotId === "WHITE-1")!;
    expect(target.allowed).toBe(true);
    expect(placementCommand(state, target, "W01", state)).toEqual({ type: "MovePlayer", fromMatchId: "M-R01-C01", fromSlotId: "WHITE-1", matchId: "M-R01-C02", slotId: "WHITE-1", playerId: "W01" });
    expect(targets.find(t => t.matchId === "M-R01-C01" && t.slotId === "WHITE-1")?.allowed).toBe(false);
  });
  it("keeps round-six feasibility in the game interaction", () => {
    let state = readyForRound(6); state = step(state, { type: "AssignPlayer", playerId: "W02", matchId: "M-R06-C03", slotId: "WHITE-1" });
    const target = placementTargets(state, project(state), "W04").find(t => t.matchId === "M-R06-C03" && t.slotId === "WHITE-2")!;
    expect(target.allowed).toBe(false); expect(target.reason).toContain("缺少");
  });
  it("previews recorded-lineup corrections while retaining the saved result", () => {
    const state = complete(readyForRound(1), "M-R01-C01");
    const view = project(state); const match = view.matches.find(m => m.id === "M-R01-C01")!;
    const edit = { matchId: match.id, lineupRevisionId: match.activeLineupRevisionId!, participants: match.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId })) };
    const before = JSON.stringify(state);
    const targets = placementTargets(state, view, "W04", edit);
    expect(targets.every(t => t.matchId === match.id)).toBe(true);
    expect(targets.find(t => t.slotId === "WHITE-2")?.allowed).toBe(true);
    expect(targets.find(t => t.slotId === "WHITE-1")?.allowed).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(match.result?.whiteScore).toBe(11);
  });
});
