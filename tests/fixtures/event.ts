import { createEvent, decide, type CompetitionCommand, type EventState } from "../../src/modules/competition";
let sequence = 0;
export function fresh(id = `test-${++sequence}`) { return createEvent(id, "2026-10-28T05:00:00.000Z"); }
export function step(state: EventState, command: CompetitionCommand): EventState {
  const i = ++sequence;
  const decision = decide(state, command, { now: new Date(Date.parse("2026-10-28T05:00:00.000Z") + i * 1000).toISOString(), actorId: "test-operator", commandId: `test-command-${i}` });
  if (!decision.ok) throw new Error(`${command.type}: ${decision.error.code} ${decision.error.message}`);
  return decision.state;
}
export function arrange(state: EventState, matchId: string): EventState {
  for (const slot of state.matches.find(m => m.id === matchId)!.draftSlots) {
    if (slot.playerId) continue;
    const player = state.players.find(p => decide(state, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: p.id }, { now: state.updatedAt, actorId: "fixture", commandId: "fixture-preview" }).ok);
    if (!player) throw new Error(`Fixture cannot fill ${matchId} ${slot.id}`);
    state = step(state, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: player.id });
  }
  return state;
}
export function complete(state: EventState, matchId: string): EventState {
  state = arrange(state, matchId); state = step(state, { type: "StartMatch", matchId });
  return step(state, { type: "SubmitResult", matchId, lineupRevisionId: state.matches.find(m => m.id === matchId)!.activeLineupRevisionId!, whiteScore: 11, blackScore: 0 });
}
export function completeRound(state: EventState): EventState {
  for (const match of state.matches.filter(m => m.roundId === state.activeRoundId)) state = complete(state, match.id);
  return state;
}
export function readyForRound(number: number): EventState {
  let state = step(fresh(), { type: "OpenFirstRound" });
  for (let n = 1; n < number; n++) { state = completeRound(state); state = step(state, { type: "AdvanceRound", roundId: state.activeRoundId! }); }
  return state;
}
