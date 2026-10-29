import { decide, type CompetitionCommand, type EventProjection, type EventState } from "../src/modules/competition";
import type { LineupEdit } from "./MatchPanel";
import type { Placement, SelectionBasis } from "../src/modules/venue";

/** Scene targets explain the existing competition decision; they introduce no rules. */
export function placementTargets(state: EventState, view: EventProjection, playerId: string | null, edit: LineupEdit | null = null): Placement[] {
  return view.matches.flatMap(match => {
    if (edit ? match.id !== edit.matchId : match.phase !== "PLANNING" || !view.isCurrent) return [];
    return match.draftSlots.map(slot => {
      const occupantId = edit ? edit.participants.find(p => p.slotId === slot.id)?.playerId ?? null : slot.playerId;
      let command: CompetitionCommand | null = null;
      if (playerId) command = edit
        ? { type: "CorrectRecordedLineup", ...edit, participants: edit.participants.map(p => p.slotId === slot.id ? { ...p, playerId } : p), reason: "RECORDED_LINEUP_ERROR" }
        : { type: occupantId ? "ReplacePlayer" : "AssignPlayer", matchId: match.id, slotId: slot.id, playerId };
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
  return { type: target.occupantId ? "ReplacePlayer" : "AssignPlayer", matchId: target.matchId, slotId: target.slotId, playerId };
}
