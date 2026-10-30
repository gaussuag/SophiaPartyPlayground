import { decide, type CompetitionCommand, type EventProjection, type EventState, type Player } from "../src/modules/competition";
import type { LineupEdit } from "./MatchPanel";
import type { Placement, SelectionBasis, SlotSelection } from "../src/modules/venue";

function candidate(state: EventState, target: Pick<Placement, "matchId" | "slotId" | "occupantId">, playerId: string): CompetitionCommand {
  const destination = state.matches.find(m => m.id === target.matchId)!;
  const source = state.matches.find(m => m.roundId === destination.roundId && m.phase === "PLANNING" && m.draftSlots.some(s => s.playerId === playerId));
  const from = source?.draftSlots.find(s => s.playerId === playerId);
  return source && from ? { type: "MovePlayer", fromMatchId: source.id, fromSlotId: from.id, matchId: target.matchId, slotId: target.slotId, playerId }
    : { type: target.occupantId ? "ReplacePlayer" : "AssignPlayer", matchId: target.matchId, slotId: target.slotId, playerId };
}

/** Scene targets explain the existing competition decision; they introduce no rules. */
export function placementTargets(state: EventState, view: EventProjection, playerId: string | null, edit: LineupEdit | null = null): Placement[] {
  return view.matches.flatMap(match => {
    if (edit ? match.id !== edit.matchId : match.phase !== "PLANNING" || !view.isCurrent) return [];
    return match.draftSlots.map(slot => {
      const occupantId = edit ? edit.participants.find(p => p.slotId === slot.id)?.playerId ?? null : slot.playerId;
      let command: CompetitionCommand | null = null;
      if (playerId) command = edit
        ? { type: "CorrectRecordedLineup", ...edit, participants: edit.participants.map(p => p.slotId === slot.id ? { ...p, playerId } : p), reason: "RECORDED_LINEUP_ERROR" }
        : candidate(state, { matchId: match.id, slotId: slot.id, occupantId }, playerId);
      const decision = command ? decide(state, command, { now: state.updatedAt, actorId: "preview", commandId: "preview" }) : null;
      return {
        matchId: match.id, courtId: match.courtId, slotId: slot.id, sideId: slot.sideId, gender: slot.gender, occupantId,
        allowed: !!playerId && occupantId !== playerId && !!decision?.ok,
        reason: occupantId === playerId ? "已在此位置" : decision && !decision.ok ? decision.error.message : null,
      };
    });
  });
}

export function placementCommand(state: EventState, target: Placement, playerId: string, basis: SelectionBasis): CompetitionCommand | null {
  if (basis.revision !== state.revision || basis.generation !== state.generation || !target.allowed) return null;
  return candidate(state, target, playerId);
}

/** Inverse of the scene's legal targets, using the same commands and rules. */
export function placementCandidates(state: EventState, view: EventProjection, selection: SlotSelection | null, edit: LineupEdit | null = null): Player[] {
  if (!selection || selection.basis.revision !== state.revision || selection.basis.generation !== state.generation) return [];
  const target = placementTargets(state, view, null, edit).find(t => t.matchId === selection.matchId && t.slotId === selection.slotId);
  if (!target) return [];
  return state.players.filter(player => {
    if (player.id === target.occupantId) return false;
    const command: CompetitionCommand = edit
      ? { type: "CorrectRecordedLineup", ...edit, participants: edit.participants.map(p => p.slotId === target.slotId ? { ...p, playerId: player.id } : p), reason: "RECORDED_LINEUP_ERROR" }
      : candidate(state, target, player.id);
    return decide(state, command, { now: state.updatedAt, actorId: "preview", commandId: "preview" }).ok;
  });
}
