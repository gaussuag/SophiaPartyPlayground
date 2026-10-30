import { describe, expect, it } from "vitest";
import { decide, project, verifySnapshot, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import { benchMarkerPosition, courtCenter, isBenchPoint, playerPlacement, worldLayout } from "../../src/modules/venue/world";
import { arrange, completeRound, readyForRound, step } from "../fixtures/event";

const first = "M-R01-C01", second = "M-R01-C02";
const move = (fromMatchId: string, matchId: string, slotId = "WHITE-1"): CompetitionCommand => ({ type: "MovePlayer", fromMatchId, fromSlotId: "WHITE-1", matchId, slotId, playerId: "W01" });
function rejected(state: EventState, command: CompetitionCommand, code: string) {
  const before = JSON.stringify(state);
  expect(decide(state, command, { now: state.updatedAt, actorId: "participant", commandId: "failed" })).toMatchObject({ ok: false, error: { code } });
  expect(JSON.stringify(state)).toBe(before);
}

describe("collaborative preparation and explicit round confirmation", () => {
  it("moves one draft reservation between courts in one validated transition", () => {
    let state = step(readyForRound(1), { type: "AssignPlayer", matchId: first, slotId: "WHITE-1", playerId: "W01" });
    const revision = state.revision;
    state = step(state, move(first, second));
    expect(state.revision).toBe(revision + 1);
    expect(state.matches[0].draftSlots[0].playerId).toBeNull();
    expect(state.matches[1].draftSlots[0].playerId).toBe("W01");
    expect(state.audit.at(-1)?.changedIds).toEqual(expect.arrayContaining([first, second, "W01"]));
    expect(verifySnapshot(state)).toBeNull();
  });
  it("releases a replaced player, permits a same-court move, and never partially clears an invalid move", () => {
    let state = step(readyForRound(1), { type: "AssignPlayer", matchId: first, slotId: "WHITE-1", playerId: "W01" });
    state = step(state, { type: "AssignPlayer", matchId: second, slotId: "WHITE-1", playerId: "W03" });
    rejected(state, move(first, second, "WHITE-2"), "WRONG_GENDER");
    rejected(state, move(first, second, "BLACK-1"), "WRONG_TEAM");
    rejected(state, move(first, first), "SAME_SLOT");
    state = step(state, move(first, second));
    expect(project(state).playerStates.W03.status).toBe("available");
    state = step(state, move(second, "M-R01-C03"));
    state = step(state, move("M-R01-C03", "M-R01-C03", "WHITE-2"));
    expect(state.matches[2].draftSlots.find(s => s.id === "WHITE-2")?.playerId).toBe("W01");
    expect(state.matches.flatMap(m => m.draftSlots).filter(s => s.playerId === "W01")).toHaveLength(1);
    expect(verifySnapshot(state)).toBeNull();
  });
  it("locks both source and destination once a match starts", () => {
    let state = arrange(readyForRound(1), first);
    state = step(state, { type: "StartMatch", matchId: first });
    rejected(state, move(first, second), "INVALID_PHASE");
    rejected(state, { type: "RemovePlayer", matchId: first, slotId: "WHITE-1" }, "INVALID_PHASE");
    state = step(state, { type: "AssignPlayer", matchId: second, slotId: "WHITE-1", playerId: "W03" });
    rejected(state, { type: "MovePlayer", fromMatchId: second, fromSlotId: "WHITE-1", matchId: first, slotId: "WHITE-1", playerId: "W03" }, "INVALID_PHASE");
  });
  it("only a saved, valid score ends play; legacy editor entry does not release players", () => {
    let state = arrange(readyForRound(1), first);
    state = step(state, { type: "StartMatch", matchId: first });
    const started = state.matches[0].startedAt;
    state = step(state, { type: "BeginResultEntry", matchId: first });
    expect(state.matches[0]).toMatchObject({ phase: "PLAYING", startedAt: started, endDeclaredAt: null });
    const score = { type: "SubmitResult" as const, matchId: first, lineupRevisionId: state.matches[0].activeLineupRevisionId!, whiteScore: 11, blackScore: 11 };
    rejected(state, score, "EQUAL_SCORE");
    state = step(state, { ...score, blackScore: 8 });
    expect(state.matches[0].phase).toBe("COMPLETED");
    expect(state.matches[0].endDeclaredAt).toBe(state.updatedAt);
    expect(verifySnapshot(state)).toBeNull();
  });
  it("can finish an existing v4 awaiting-result record without migrating or losing its lineup", () => {
    let state = step(arrange(readyForRound(1), first), { type: "StartMatch", matchId: first });
    state.matches[0].phase = "AWAITING_RESULT"; state.matches[0].endDeclaredAt = state.updatedAt;
    const lineupId = state.matches[0].activeLineupRevisionId!;
    expect(verifySnapshot(state)).toBeNull();
    state = step(state, { type: "SubmitResult", matchId: first, lineupRevisionId: lineupId, whiteScore: 11, blackScore: 9 });
    expect(state.matches[0]).toMatchObject({ phase: "COMPLETED", activeLineupRevisionId: lineupId });
    expect(state.lineups).toHaveLength(1);
  });
  it.each([[390, 844], [1385, 892]])("keeps the result tableau, resets only on advance, and reconstructs history at %sx%s", (width, height) => {
    let state = arrange(readyForRound(1), first);
    state = step(state, { type: "StartMatch", matchId: first });
    const layout = worldLayout(width, height), before = playerPlacement(state, project(state), "W01", layout);
    expect(before.onCourt).toBe(true);
    state = step(state, { type: "SubmitResult", matchId: first, lineupRevisionId: state.matches[0].activeLineupRevisionId!, whiteScore: 11, blackScore: 3 });
    expect(playerPlacement(state, project(state), "W01", layout)).toEqual(before);
    // Complete only the other two matches; the first result stays unchanged.
    for (const match of state.matches.filter(m => m.roundId === "R01" && m.id !== first)) {
      state = step(arrange(state, match.id), { type: "StartMatch", matchId: match.id });
      state = step(state, { type: "SubmitResult", matchId: match.id, lineupRevisionId: state.matches.find(m => m.id === match.id)!.activeLineupRevisionId!, whiteScore: 11, blackScore: 5 });
    }
    expect(project(state)).toMatchObject({ roundLabel: "等待本轮确认", canAdvance: true, completed: 3 });
    expect(state.activeRoundId).toBe("R01");
    state = step(state, { type: "AdvanceRound", roundId: "R01" });
    expect(state.players.every(p => !playerPlacement(state, project(state), p.id, layout).onCourt)).toBe(true);
    const historical = project(state, { roundId: "R01" });
    expect(historical.roundLabel).toBe("本轮已结束");
    expect(playerPlacement(state, historical, "W01", layout)).toEqual(before);
    expect(historical.matches[0].result?.whiteScore).toBe(11);
    expect(verifySnapshot(state)).toBeNull();
  });
  it("labels preparation, play and final-round 2/2 without auto-closing", () => {
    let state = readyForRound(1); expect(project(state).roundLabel).toBe("准备中");
    state = step(arrange(state, first), { type: "StartMatch", matchId: first });
    expect(project(state).roundLabel).toBe("比赛中");
    state = completeRound(readyForRound(7));
    expect(project(state)).toMatchObject({ total: 2, completed: 2, canAdvance: true, roundLabel: "等待本轮确认" });
    expect(state.rounds[6].phase).toBe("OPEN");
  });
  it.each([[390, 844], [1385, 892]])("returns only to the correct team's candidate area at %sx%s", (width, height) => {
    const layout = worldLayout(width, height);
    for (const side of ["WHITE", "BLACK"] as const) {
      expect(isBenchPoint(benchMarkerPosition(side), side, layout)).toBe(true);
      expect(isBenchPoint(benchMarkerPosition(side), side === "WHITE" ? "BLACK" : "WHITE", layout)).toBe(false);
      for (const court of [1, 2, 3]) expect(isBenchPoint(courtCenter(court, layout), side, layout)).toBe(false);
    }
  });
});
