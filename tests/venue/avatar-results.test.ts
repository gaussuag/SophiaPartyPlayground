import { describe, expect, it } from "vitest";
import { project } from "../../src/modules/competition";
import { AvatarResults } from "../../src/modules/venue/avatar-results";
import { arrange, complete, readyForRound, step } from "../fixtures/event";

describe("committed result reactions", () => {
  it("reacts once to a fresh confirmed result, distinguishing winners and acknowledgement", () => {
    let state = readyForRound(1);
    const observer = new AvatarResults(), matchId = project(state).matches[0].id;
    observer.observe(state, project(state));
    state = complete(state, matchId); observer.observe(state, project(state));
    const participants = project(state).matches[0].participants;
    for (const player of participants) expect(observer.get(player.playerId)?.kind).toBe(player.teamId === "WHITE" ? "celebrate" : "acknowledge");
    const token = observer.get(participants[0].playerId)?.token;
    observer.observe(structuredClone(state), project(state));
    expect(observer.get(participants[0].playerId)?.token).toBe(token);
    const result = project(state).matches[0].result!;
    state = step(state, { type: "CorrectResult", matchId, lineupRevisionId: result.lineupRevisionId, resultRevisionId: result.id, whiteScore: 9, blackScore: 11, reason: "SCORE_ENTRY_ERROR" });
    observer.observe(state, project(state));
    expect(observer.get(participants[0].playerId)?.token).toBe(token);
  });

  it("does not celebrate assignments or failed saves, and initial load/rebuild is silent", () => {
    let state = readyForRound(1);
    const observer = new AvatarResults(), matchId = project(state).matches[0].id;
    observer.observe(state, project(state));
    state = arrange(state, matchId); observer.observe(state, project(state));
    observer.observe(state, project(state));
    expect(state.players.every(p => !observer.get(p.id))).toBe(true);
    state = complete(state, matchId);
    const rebuilt = new AvatarResults(); rebuilt.observe(state, project(state));
    expect(state.players.every(p => !rebuilt.get(p.id))).toBe(true);
  });

  it("history transitions and restore generations establish a fresh baseline", () => {
    let state = readyForRound(2);
    const observer = new AvatarResults(), matchId = project(state).matches[0].id;
    observer.observe(state, project(state, { roundId: state.rounds[0].id }));
    state = complete(state, matchId);
    observer.observe(state, project(state));
    expect(state.players.every(p => !observer.get(p.id))).toBe(true);
    observer.observe({ ...state, generation: state.generation + 1, revision: state.revision + 1 }, project(state));
    expect(state.players.every(p => !observer.get(p.id))).toBe(true);
  });

  it("withdraw and re-submit do not replay a previously consumed match celebration", () => {
    let state = readyForRound(1);
    const observer = new AvatarResults(), matchId = project(state).matches[0].id;
    observer.observe(state, project(state));
    state = complete(state, matchId); observer.observe(state, project(state));
    const participant = project(state).matches[0].participants[0], token = observer.get(participant.playerId)?.token;
    state = step(state, { type: "WithdrawCurrentResult", matchId, reason: "RESULT_ENTERED_TOO_EARLY" }); observer.observe(state, project(state));
    const match = project(state).matches[0];
    state = step(state, { type: "SubmitResult", matchId, lineupRevisionId: match.activeLineupRevisionId!, whiteScore: 11, blackScore: 2 }); observer.observe(state, project(state));
    expect(observer.get(participant.playerId)?.token).toBe(token);
  });
});
