import { describe, expect, it } from "vitest";
import { placementCandidates, placementCommand, placementTargets } from "../../app/placements";
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

  it("offers only the chosen side and gender, using the current snapshot without mutating it", () => {
    const state = readyForRound(1), before = JSON.stringify(state);
    const selection = { matchId: "M-R01-C01", slotId: "BLACK-1", basis: state };
    expect(placementCandidates(state, project(state), selection).map(p => p.id)).toEqual(["B02", "B04", "B05", "B06"]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("includes a legal preparing reservation as an atomic move, but excludes locked players", () => {
    let state = readyForRound(1);
    state = step(state, { type: "AssignPlayer", matchId: "M-R01-C02", slotId: "BLACK-1", playerId: "B02" });
    const target = { matchId: "M-R01-C01", slotId: "BLACK-1", basis: state };
    expect(placementCandidates(state, project(state), target).map(p => p.id)).toContain("B02");
    state = complete(state, "M-R01-C02");
    expect(placementCandidates(state, project(state), { ...target, basis: state }).map(p => p.id)).not.toContain("B02");
  });
  it("keeps whole-round feasibility in the candidate cards", () => {
    let state = readyForRound(6);
    state = step(state, { type: "AssignPlayer", playerId: "W02", matchId: "M-R06-C03", slotId: "WHITE-1" });
    const candidates = placementCandidates(state, project(state), { matchId: "M-R06-C03", slotId: "WHITE-2", basis: state });
    // Moving W02 from the first free slot is legal: it does not add a second woman.
    expect(candidates.map(p => p.id)).toEqual(["W01", "W02", "W03", "W06", "W07"]);
  });
  it("does not silently rebase a picker after another revision or a restore", () => {
    const state = readyForRound(1), target = { matchId: "M-R01-C01", slotId: "BLACK-1", basis: { revision: state.revision, generation: state.generation } };
    const newer = step(state, { type: "AssignPlayer", playerId: "W01", matchId: "M-R01-C02", slotId: "WHITE-1" });
    expect(placementCandidates(newer, project(newer), target)).toEqual([]);
    expect(placementCandidates(state, project(state), { ...target, basis: { ...target.basis, generation: state.generation + 1 } })).toEqual([]);
    expect(placementCandidates(state, project(state, { roundId: "R02" }), { ...target, matchId: "M-R02-C01" })).toEqual([]);
    expect(placementCandidates(state, project(state), null)).toEqual([]);
  });
  it("supports explicit recorded-lineup editing without previewing a saved result change", () => {
    const state = complete(readyForRound(1), "M-R01-C01"), view = project(state), match = view.matches[0], before = JSON.stringify(state);
    const edit = { matchId: match.id, lineupRevisionId: match.activeLineupRevisionId!, participants: match.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId })) };
    const target = { matchId: match.id, slotId: "WHITE-2", basis: state };
    expect(placementCandidates(state, view, target)).toEqual([]);
    expect(placementCandidates(state, view, target, edit).map(p => p.id)).toEqual(["W04", "W05"]);
    expect(JSON.stringify(state)).toBe(before);
  });
});
