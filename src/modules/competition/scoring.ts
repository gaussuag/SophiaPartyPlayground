import type { EventState, TeamId } from "./model";
export const SOPHIA_ID = "B01";
export function matchPoints(state: EventState, matchId: string, lineupRevisionId?: string): 1 | 2 | null {
  if (state.ruleVersion !== 2) return null;
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return null;
  const lineupId = lineupRevisionId ?? match.activeLineupRevisionId;
  const participants = lineupId ? state.lineups.find(l => l.id === lineupId && l.matchId === matchId)?.participants : match.draftSlots;
  return participants?.some(p => p.playerId === SOPHIA_ID) ? 2 : 1;
}
export function teamStandings(state: EventState) {
  const totals: Record<TeamId, number> = { WHITE: 0, BLACK: 0 };
  const wins: Record<TeamId, number> = { WHITE: 0, BLACK: 0 };
  let completed = 0;
  for (const match of state.matches) {
    const result = state.results.find(r => r.id === match.activeResultRevisionId && r.matchId === match.id);
    if (!result || match.phase !== "COMPLETED") continue;
    completed++; wins[result.winnerTeamId]++;
    totals[result.winnerTeamId] += matchPoints(state, match.id, result.lineupRevisionId) ?? 0;
  }
  return { enabled: state.ruleVersion === 2, totals, wins, completed, totalMatches: state.matches.length };
}

/** Finale is a derived local view, never an eighth competition round. */
export function finaleOutcome(state: EventState) {
  const standings = teamStandings(state);
  const unlocked = state.rounds.length === 7 && state.rounds.every(r => r.phase === "CLOSED") && state.activeRoundId === null && standings.completed === standings.totalMatches;
  const winner: TeamId | null = unlocked && standings.enabled && standings.totals.WHITE !== standings.totals.BLACK ? standings.totals.WHITE > standings.totals.BLACK ? "WHITE" : "BLACK" : null;
  return { unlocked, winner, loser: winner ? winner === "WHITE" ? "BLACK" as const : "WHITE" as const : null, totals: standings.totals };
}
