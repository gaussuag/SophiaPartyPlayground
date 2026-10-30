import { describe, expect, it } from "vitest";
import { createEvent, decide, matchPoints, project, teamStandings, verifySnapshot, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import { arrange, completeRound, step } from "../fixtures/event";
import { placementCandidates, placementTargets } from "../../app/placements";
const fresh = () => createEvent("test-new-cup", "2026-10-30T00:00:00.000Z");
const open = () => step(fresh(), { type: "OpenFirstRound" });
const reject = (state: EventState, command: CompetitionCommand, code: string) => {
  const before = structuredClone(state);
  expect(decide(state, command, { now: state.updatedAt, actorId: "test", commandId: "reject" })).toMatchObject({ ok: false, error: { code } });
  expect(state).toEqual(before);
};
function roundTwo() { const state = completeRound(open()); return step(state, { type: "AdvanceRound", roundId: "R01" }); }
function scoredSophia(side: "WHITE" | "BLACK" = "WHITE") {
  let state = step(open(), { type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side}-1`, playerId: "B01" });
  state = arrange(state, "M-R01-C01"); state = step(state, { type: "StartMatch", matchId: "M-R01-C01" });
  const lineupRevisionId = state.matches[0].activeLineupRevisionId!;
  return step(state, { type: "SubmitResult", matchId: "M-R01-C01", lineupRevisionId, whiteScore: 3, blackScore: 2 });
}
describe("2026-10-30 revised cup through the competition interface", () => {
  it("keeps stable identities: six white, six black, Sophia free, Mike absent", () => {
    const state = fresh(); expect(state.players).toHaveLength(13); expect(state.players.find(p => p.id === "W07")).toBeUndefined();
    expect(state.players.find(p => p.id === "B01")).toMatchObject({ name: "Sophia", teamId: "FREE", gender: "FEMALE", rawValue: 2 });
    expect(state.players.filter(p => p.teamId === "WHITE")).toHaveLength(6); expect(state.players.filter(p => p.teamId === "BLACK")).toHaveLength(6);
    expect(state.ruleVersion).toBe(2); expect(verifySnapshot(state)).toBeNull();
  });
  it("alternates exact court types over seven complete three-court rounds", () => {
    const state = fresh(); expect(state.matches).toHaveLength(21); expect(state.courtBlocks).toEqual([]);
    for (const round of state.rounds) {
      const view = project(state, { roundId: round.id });
      expect(view.total).toBe(3);
      expect(view.matches.map(m => m.type)).toEqual(round.number % 2 ? ["WOMENS_DOUBLES", "MENS_DOUBLES", "MENS_SINGLES"] : ["MIXED_DOUBLES", "MIXED_DOUBLES", "WOMENS_SINGLES"]);
    }
  });
  it.each(["WHITE", "BLACK"] as const)("permits Sophia on %s in an odd round but still applies gender and one-seat constraints", side => {
    let state = open(); reject(state, { type: "AssignPlayer", matchId: "M-R01-C02", slotId: `${side}-1`, playerId: "B01" }, "WRONG_GENDER");
    state = step(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side}-1`, playerId: "B01" });
    reject(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side === "WHITE" ? "BLACK" : "WHITE"}-1`, playerId: "B01" }, "PLAYER_RESERVED");
    reject(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: "WHITE-2", playerId: "W07" }, "UNKNOWN_PLAYER");
    expect(verifySnapshot(state)).toBeNull();
  });
  it("globally reserves the one free female for black across all even-round courts", () => {
    let state = roundTwo();
    for (const [matchId, slotId] of [["M-R02-C01", "WHITE-2"], ["M-R02-C02", "WHITE-2"], ["M-R02-C03", "WHITE-1"]]) reject(state, { type: "AssignPlayer", matchId, slotId, playerId: "B01" }, "ROUND_INFEASIBLE");
    const view = project(state), basis = { revision: state.revision, generation: state.generation };
    expect(placementCandidates(state, view, { matchId: "M-R02-C03", slotId: "WHITE-1", basis }).some(p => p.id === "B01")).toBe(false);
    expect(placementCandidates(state, view, { matchId: "M-R02-C03", slotId: "BLACK-1", basis }).some(p => p.id === "B01")).toBe(true);
    state = step(state, { type: "AssignPlayer", matchId: "M-R02-C03", slotId: "BLACK-1", playerId: "B01" });
    const target = placementTargets(state, project(state), "B01").find(t => t.matchId === "M-R02-C01" && t.slotId === "BLACK-2")!;
    expect(target.allowed).toBe(true);
    state = step(state, { type: "MovePlayer", fromMatchId: "M-R02-C03", fromSlotId: "BLACK-1", matchId: target.matchId, slotId: target.slotId, playerId: "B01" });
    state = step(state, { type: "RemovePlayer", matchId: target.matchId, slotId: target.slotId }); expect(verifySnapshot(state)).toBeNull();
  });
  it("locks the represented side only when confirmed and counts Sophia's actual match side", () => {
    let state = scoredSophia("WHITE"); const m = state.matches[0];
    expect(state.lineups[0].participants.find(p => p.playerId === "B01")).toMatchObject({ teamId: "FREE", sideId: "WHITE" });
    expect(matchPoints(state, m.id)).toBe(2); expect(teamStandings(state).totals).toEqual({ WHITE: 2, BLACK: 0 });
    reject(state, { type: "RemovePlayer", matchId: m.id, slotId: "WHITE-1" }, "INVALID_PHASE");
    state = step(state, { type: "WithdrawCurrentResult", matchId: m.id, reason: "RESULT_ENTERED_TOO_EARLY" });
    expect(teamStandings(state).totals).toEqual({ WHITE: 0, BLACK: 0 });
  });
  it("awards two to the winner even when Sophia loses, with no 11/15 target check", () => {
    const state = scoredSophia("BLACK"); expect(teamStandings(state).totals).toEqual({ WHITE: 2, BLACK: 0 }); expect(verifySnapshot(state)).toBeNull();
  });
  it("corrects the effective winner and lineup weight without double-counting history", () => {
    let state = scoredSophia(); let m = state.matches[0];
    state = step(state, { type: "CorrectResult", matchId: m.id, lineupRevisionId: m.activeLineupRevisionId!, resultRevisionId: m.activeResultRevisionId!, whiteScore: 9, blackScore: 15, reason: "SCORE_ENTRY_ERROR" });
    expect(state.results).toHaveLength(2); expect(teamStandings(state).totals).toEqual({ WHITE: 0, BLACK: 2 });
    m = state.matches[0];
    state = step(state, { type: "CorrectRecordedLineup", matchId: m.id, lineupRevisionId: m.activeLineupRevisionId!, participants: state.lineups.find(l => l.id === m.activeLineupRevisionId)!.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId === "B01" ? "W05" : p.playerId })), reason: "RECORDED_LINEUP_ERROR" });
    expect(state.results).toHaveLength(3); expect(teamStandings(state).totals).toEqual({ WHITE: 0, BLACK: 1 });
    expect(matchPoints(state, m.id, state.results[0].lineupRevisionId)).toBe(2); expect(verifySnapshot(state)).toBeNull();
  });
  it("plays all 21 matches, keeps Sophia unique each round, resets new-round drafts, and sums 28 awards", () => {
    let state = open();
    for (let number = 1; number <= 7; number++) {
      const round = state.activeRoundId!;
      expect(project(state).total).toBe(3);
      const side = number % 2 ? (number % 4 === 1 ? "WHITE" : "BLACK") : "BLACK";
      state = step(state, { type: "AssignPlayer", matchId: `M-${round}-C01`, slotId: `${side}-${number % 2 ? 1 : 2}`, playerId: "B01" });
      state = completeRound(state); expect(state.activeRoundId).toBe(round); expect(project(state).canAdvance).toBe(true);
      expect(state.lineups.filter(l => state.matches.some(m => m.id === l.matchId && m.roundId === round)).flatMap(l => l.participants).filter(p => p.playerId === "B01")).toHaveLength(1);
      state = step(state, { type: "AdvanceRound", roundId: round }); expect(verifySnapshot(state)).toBeNull();
      if (state.activeRoundId) expect(project(state).matches.flatMap(m => m.draftSlots).every(s => s.playerId === null)).toBe(true);
    }
    state = step(state, { type: "FinishEvent" }); expect(state.results).toHaveLength(21);
    expect(teamStandings(state)).toMatchObject({ enabled: true, completed: 21, totals: { WHITE: 28, BLACK: 0 } });
    expect(state.lineups.reduce((n, l) => n + l.participants.length, 0)).toBe(70);
  });
  it("preserves v1 backup identity and leaves its undefined points unscored", () => {
    const state = createEvent("old-cup", "2026-10-30T00:00:00Z", 1); expect(verifySnapshot(state)).toBeNull(); expect(state.matches).toHaveLength(20);
    expect(teamStandings(state).enabled).toBe(false); expect(matchPoints(state, state.matches[0].id)).toBeNull();
    const tampered = structuredClone(fresh()); tampered.players.find(p => p.id === "B01")!.teamId = "WHITE";
    expect(verifySnapshot(tampered)?.code).toBe("IDENTITY_MISMATCH");
  });
});
