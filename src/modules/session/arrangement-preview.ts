import { decide, type EventState } from "../competition";
import type { CommandEnvelope } from "../records/protocol";

/** Presentation only. Never use this snapshot to validate, persist, or confirm a match. */
export type ArrangementPreview = { state: EventState; commandId: string; playerIds: string[] };
type Change = { matchId: string; slotId: string; before: string | null; after: string | null };
type Intent = { envelope: CommandEnvelope; roundId: string | null; changes: Change[]; playerIds: string[] };
const commands = new Set(["AssignPlayer", "ReplacePlayer", "MovePlayer", "RemovePlayer", "CancelDraft"]);

/** One in-flight visual intent, rebased onto fresh authority without replacing it. */
export class ArrangementPrediction {
  private intent: Intent | null = null;

  begin(state: EventState, envelope: CommandEnvelope) {
    this.intent = null;
    if (!commands.has(envelope.command.type) || state.id !== envelope.eventId || state.revision !== envelope.expectedRevision || state.generation !== envelope.expectedGeneration) return;
    const result = decide(state, envelope.command, { now: state.updatedAt, actorId: "local-preview", commandId: envelope.commandId });
    if (!result.ok) return;
    const changes: Change[] = [];
    for (const match of state.matches) for (const slot of match.draftSlots) {
      const after = result.state.matches.find(m => m.id === match.id)!.draftSlots.find(s => s.id === slot.id)!.playerId;
      if (after !== slot.playerId) changes.push({ matchId: match.id, slotId: slot.id, before: slot.playerId, after });
    }
    if (changes.length) this.intent = { envelope, roundId: state.activeRoundId, changes, playerIds: [...new Set(changes.flatMap(c => [c.before, c.after]).filter((id): id is string => id !== null))] };
  }

  clear(commandId: string) { if (this.intent?.envelope.commandId === commandId) this.intent = null; }

  project(state: EventState | null): ArrangementPreview | null {
    const intent = this.intent;
    if (!state || !intent || state.id !== intent.envelope.eventId || state.generation !== intent.envelope.expectedGeneration || state.activeRoundId !== intent.roundId) return null;
    const slots = intent.changes.map(c => ({ change: c, match: state.matches.find(m => m.id === c.matchId) }));
    if (slots.some(s => s.match?.phase !== "PLANNING")) return null;
    const value = (s: typeof slots[number]) => s.match!.draftSlots.find(slot => slot.id === s.change.slotId)?.playerId;
    if (slots.every(s => value(s) === s.change.after)) return { state, commandId: intent.envelope.commandId, playerIds: intent.playerIds };
    if (!slots.every(s => value(s) === s.change.before)) return null;
    // Fresh unrelated changes are preserved; re-check occupancy and feasibility.
    const result = decide(state, intent.envelope.command, { now: state.updatedAt, actorId: "local-preview", commandId: intent.envelope.commandId });
    if (!result.ok) return null;
    const matches = state.matches.map(match => {
      const changes = intent.changes.filter(c => c.matchId === match.id);
      return changes.length ? { ...match, draftSlots: match.draftSlots.map(slot => {
        const change = changes.find(c => c.slotId === slot.id);
        return change ? { ...slot, playerId: change.after } : slot;
      }) } : match;
    });
    return { state: { ...state, matches }, commandId: intent.envelope.commandId, playerIds: intent.playerIds };
  }
}
