import { describe, expect, it } from "vitest";
import { decide, project, verifySnapshot, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import { arrange, complete, completeRound, fresh, readyForRound, step } from "../fixtures/event";
const m1 = "M-R01-C01"; const m2 = "M-R01-C02";
function refusal(state: EventState, command: CompetitionCommand, code: string) {
  const before = JSON.stringify(state);
  const result = decide(state, command, { now: "2026-10-28T06:00:00.000Z", actorId: "test", commandId: "rejected" });
  expect(result).toMatchObject({ ok: false, error: { code } }); expect(JSON.stringify(state)).toBe(before);
}
describe("template and business transitions through the competition interface", () => {
  it("D01–D03 preserves all identities and starts without assignments", () => {
    const state = fresh(); expect(state.players).toHaveLength(14); expect(state.matches).toHaveLength(20); expect(state.courts).toHaveLength(3); expect(state.rounds).toHaveLength(7);
    for (const team of ["WHITE", "BLACK"]) { const people = state.players.filter(p => p.teamId === team); expect(people).toHaveLength(7); expect(people.filter(p => p.gender === "MALE")).toHaveLength(4); }
    expect(Object.fromEntries([...new Set(state.matches.map(m => m.type))].map(t => [t, state.matches.filter(m => m.type === t).length]))).toEqual({ MIXED_DOUBLES: 7, MENS_DOUBLES: 2, OPEN_DOUBLES: 6, MENS_SINGLES: 3, WOMENS_DOUBLES: 1, WOMENS_SINGLES: 1 });
    expect(state.matches.every(m => m.draftSlots.every(s => s.playerId === null))).toBe(true); expect(verifySnapshot(state)).toBeNull(); expect(project(state).round.number).toBe(1); expect(project(state, { roundId: "R07" }).total).toBe(2);
  });
  it("B01–B03 rejects wrong side/gender, incomplete lineups, and preserves a failed replacement", () => {
    let state = readyForRound(1);
    refusal(state, { type: "StartMatch", matchId: m1 }, "INCOMPLETE_LINEUP");
    refusal(state, { type: "AssignPlayer", matchId: m1, slotId: "WHITE-1", playerId: "B02" }, "WRONG_TEAM");
    refusal(state, { type: "AssignPlayer", matchId: m1, slotId: "WHITE-1", playerId: "W02" }, "WRONG_GENDER");
    state = step(state, { type: "AssignPlayer", matchId: m1, slotId: "WHITE-1", playerId: "W01" });
    refusal(state, { type: "AssignPlayer", matchId: m2, slotId: "WHITE-1", playerId: "W01" }, "PLAYER_RESERVED");
    refusal(state, { type: "ReplacePlayer", matchId: m1, slotId: "WHITE-1", playerId: "W02" }, "WRONG_GENDER");
    expect(state.matches[0].draftSlots[0].playerId).toBe("W01"); state = step(state, { type: "CancelDraft", matchId: m1 });
    expect(project(state).playerStates.W01.status).toBe("available");
  });
  it("B04 keeps participation after ending while allowing three independent match phases", () => {
    let state = readyForRound(1); state = complete(state, m1); state = arrange(state, m2); state = step(state, { type: "StartMatch", matchId: m2 });
    expect(project(state).matches.map(m => m.phase)).toEqual(["COMPLETED", "PLAYING", "PLANNING"]);
    expect(project(state).playerStates.W01.status).toBe("played_this_round");
    refusal(state, { type: "AssignPlayer", matchId: "M-R01-C03", slotId: "WHITE-1", playerId: "W01" }, "PLAYED_THIS_ROUND");
    refusal(state, { type: "AssignPlayer", matchId: "M-R02-C02", slotId: "WHITE-1", playerId: "W03" }, "NOT_CURRENT_ROUND");
  });
  it("B05 derives round-six feasibility without treating raw values as skill", () => {
    let state = readyForRound(6);
    state = step(state, { type: "AssignPlayer", matchId: "M-R06-C03", slotId: "WHITE-1", playerId: "W02" });
    refusal(state, { type: "AssignPlayer", matchId: "M-R06-C03", slotId: "WHITE-2", playerId: "W04" }, "ROUND_INFEASIBLE");
    state = step(state, { type: "AssignPlayer", matchId: "M-R06-C03", slotId: "WHITE-2", playerId: "W01" }); expect(verifySnapshot(state)).toBeNull();
  });
  it.each([[0, 1, true], [11, 10, true], [1, 0, true], [15, 15, false], [-1, 2, false], [1.5, 2, false], [Number.MAX_SAFE_INTEGER + 1, 1, false]])("B06–B07 final scores %s:%s valid=%s", (whiteScore, blackScore, valid) => {
    let state = arrange(readyForRound(1), m1); state = step(state, { type: "StartMatch", matchId: m1 }); state = step(state, { type: "BeginResultEntry", matchId: m1 });
    const decision = decide(state, { type: "SubmitResult", matchId: m1, lineupRevisionId: state.matches[0].activeLineupRevisionId!, whiteScore, blackScore }, { now: state.updatedAt, actorId: "test", commandId: "score" });
    expect(decision.ok).toBe(valid); if (decision.ok) expect(decision.state.results[0].winnerTeamId).toBe(whiteScore > blackScore ? "WHITE" : "BLACK");
  });
  it("B08 plays all 20 matches, manually closes exactly seven rounds, and finishes", () => {
    let state = readyForRound(1); refusal(state, { type: "AdvanceRound", roundId: "R01" }, "ROUND_INCOMPLETE");
    for (let i = 1; i <= 7; i++) { state = completeRound(state); expect(project(state).total).toBe(i === 7 ? 2 : 3); const roundId = state.activeRoundId!; state = step(state, { type: "AdvanceRound", roundId }); refusal(state, { type: "AdvanceRound", roundId }, "NOT_CURRENT_ROUND"); }
    expect(state.activeRoundId).toBeNull(); state = step(state, { type: "FinishEvent" }); expect(state.phase).toBe("FINISHED"); expect(state.results).toHaveLength(20); expect(state.lineups.reduce((n, l) => n + l.participants.length, 0)).toBe(72); expect(verifySnapshot(state)).toBeNull();
  });
  it("B09 undoing an accidental start restores the saved reservation and retains audit", () => {
    let state = arrange(readyForRound(1), m1); state = step(state, { type: "StartMatch", matchId: m1 }); state = step(state, { type: "UndoStart", matchId: m1, reason: "ACTUAL_NOT_STARTED" });
    expect(state.lineups).toHaveLength(1); expect(state.matches[0].activeLineupRevisionId).toBeNull(); expect(project(state).playerStates.W01.status).toBe("reserved");
    state = step(state, { type: "StartMatch", matchId: m1 }); const started = state.matches[0].startedAt; state = step(state, { type: "BeginResultEntry", matchId: m1 });
    expect(project(state).playerStates.W01.status).toBe("playing"); state = step(state, { type: "UndoEndDeclaration", matchId: m1, reason: "ACCIDENTAL_END" }); expect(state.matches[0].startedAt).toBe(started); expect(state.matches[0].endDeclaredAt).toBeNull(); expect(verifySnapshot(state)).toBeNull();
  });
  it("B10–B11 versions historical score and actual lineup atomically without rewinding rounds", () => {
    let state = readyForRound(2); const match = state.matches[0]; const previous = state.results[0];
    state = step(state, { type: "CorrectResult", matchId: m1, lineupRevisionId: match.activeLineupRevisionId!, resultRevisionId: match.activeResultRevisionId!, whiteScore: 0, blackScore: 12, reason: "SIDES_SWAPPED" });
    expect(state.results[0]).toEqual(previous); expect(state.activeRoundId).toBe("R02");
    refusal(state, { type: "WithdrawCurrentResult", matchId: m1, reason: "RESULT_ENTERED_TOO_EARLY" }, "NOT_CURRENT_ROUND");
    const participants = state.lineups.find(l => l.id === state.matches[0].activeLineupRevisionId)!.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId === "W02" ? "W05" : p.playerId }));
    state = step(state, { type: "CorrectRecordedLineup", matchId: m1, lineupRevisionId: state.matches[0].activeLineupRevisionId!, participants, reason: "RECORDED_LINEUP_ERROR" });
    const currentResult = state.results.find(r => r.id === state.matches[0].activeResultRevisionId)!; expect(currentResult.lineupRevisionId).toBe(state.matches[0].activeLineupRevisionId); expect(currentResult.blackScore).toBe(12); expect(state.activeRoundId).toBe("R02"); expect(verifySnapshot(state)).toBeNull();
    const conflict = participants.map(p => ({ ...p, playerId: p.slotId === "WHITE-1" ? "W03" : p.playerId }));
    refusal(state, { type: "CorrectRecordedLineup", matchId: m1, lineupRevisionId: state.matches[0].activeLineupRevisionId!, participants: conflict, reason: "RECORDED_LINEUP_ERROR" }, "PLAYED_THIS_ROUND");
  });
  it("rejects stale lineup bindings and only withdraws the first current result", () => {
    let state = complete(readyForRound(1), m1);
    state = step(state, { type: "WithdrawCurrentResult", matchId: m1, reason: "RESULT_ENTERED_TOO_EARLY" }); expect(state.results).toHaveLength(1); expect(state.matches[0].phase).toBe("PLAYING");
    refusal(state, { type: "SubmitResult", matchId: m1, lineupRevisionId: "old-lineup", whiteScore: 1, blackScore: 0 }, "LINEUP_CHANGED");
    state = step(state, { type: "SubmitResult", matchId: m1, lineupRevisionId: state.matches[0].activeLineupRevisionId!, whiteScore: 2, blackScore: 0 }); expect(state.results).toHaveLength(2); expect(verifySnapshot(state)).toBeNull();
  });
  it("rejects backup identity changes, duplicate participants and broken references", () => {
    const state = complete(readyForRound(1), m1);
    const variants = [structuredClone(state), structuredClone(state), structuredClone(state)];
    variants[0].players[0].rawValue = 99; variants[1].lineups[0].participants[1].playerId = "W01"; variants[2].results[0].lineupRevisionId = "missing";
    for (const candidate of variants) expect(verifySnapshot(candidate)).not.toBeNull();
  });
  it("can correct a historical participant who is playing later in a non-overlapping round", () => {
    let state = readyForRound(2); state = arrange(state, "M-R02-C01");
    state = step(state, { type: "ReplacePlayer", matchId: "M-R02-C01", slotId: "WHITE-2", playerId: "W05" });
    state = step(state, { type: "StartMatch", matchId: "M-R02-C01" }); expect(verifySnapshot(state)).toBeNull();
    const participants = state.lineups.find(l => l.id === state.matches[0].activeLineupRevisionId)!.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId === "W02" ? "W05" : p.playerId }));
    state = step(state, { type: "CorrectRecordedLineup", matchId: m1, lineupRevisionId: state.matches[0].activeLineupRevisionId!, participants, reason: "RECORDED_LINEUP_ERROR" }); expect(verifySnapshot(state)).toBeNull();
  });
});
