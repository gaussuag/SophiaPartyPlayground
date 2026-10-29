import type { EventProjection, EventState } from "../competition";

export type AvatarReaction = { token: number; kind: "celebrate" | "acknowledge" };

/** Observe committed current-round transitions, never commands or optimistic
 * selections. A new observer/history/generation establishes a silent baseline. */
export class AvatarResults {
  private context = "";
  private revision = -1;
  private completed = new Set<string>();
  private seen = new Set<string>();
  private sequence = 0;
  private reactions = new Map<string, AvatarReaction>();

  get(playerId: string) { return this.reactions.get(playerId); }
  observe(state: EventState, view: EventProjection) {
    const context = `${state.id}:${state.generation}:${view.round.id}:${view.isCurrent}`;
    const current = new Set(view.matches.filter(m => m.phase === "COMPLETED" && m.result).map(m => m.id));
    if (context !== this.context) {
      this.context = context; this.revision = state.revision; this.completed = current; this.reactions.clear();
      for (const id of current) this.seen.add(`${state.id}:${state.generation}:${id}`);
      return;
    }
    if (state.revision <= this.revision) return;
    this.revision = state.revision;
    if (view.isCurrent) for (const match of view.matches) {
      const key = `${state.id}:${state.generation}:${match.id}`;
      if (!current.has(match.id) || this.completed.has(match.id) || this.seen.has(key)) continue;
      this.seen.add(key);
      for (const participant of match.participants) this.reactions.set(participant.playerId, { token: ++this.sequence, kind: participant.teamId === match.result!.winnerTeamId ? "celebrate" : "acknowledge" });
    }
    this.completed = current;
  }
}
