export type TeamId = "WHITE" | "BLACK";
export type Gender = "MALE" | "FEMALE";
export type MatchType = "MIXED_DOUBLES" | "MENS_DOUBLES" | "WOMENS_DOUBLES" | "MENS_SINGLES" | "WOMENS_SINGLES" | "OPEN_DOUBLES";
export type MatchPhase = "PLANNING" | "PLAYING" | "AWAITING_RESULT" | "COMPLETED";
export type Reason = "ACTUAL_NOT_STARTED" | "ACCIDENTAL_END" | "SCORE_ENTRY_ERROR" | "SIDES_SWAPPED" | "REVERT_CORRECTION" | "RESULT_ENTERED_TOO_EARLY" | "RECORDED_LINEUP_ERROR";
export type Player = { id: string; name: string; gender: Gender; teamId: TeamId; rawValue: number; avatarKey: string };
export type Slot = { id: string; sideId: TeamId; gender: Gender | null; playerId: string | null };
export type Participant = { slotId: string; sideId: TeamId; playerId: string; name: string; gender: Gender; teamId: TeamId };
export type Round = { id: string; number: number; plannedStart: string; plannedEnd: string; phase: "UPCOMING" | "OPEN" | "CLOSED"; openedAt: string | null; closedAt: string | null };
export type Match = { id: string; roundId: string; courtId: string; type: MatchType; label: string; phase: MatchPhase; draftSlots: Slot[]; activeLineupRevisionId: string | null; activeResultRevisionId: string | null; startedAt: string | null; endDeclaredAt: string | null };
export type LineupRevision = { id: string; matchId: string; participants: Participant[]; confirmedAt: string; supersedes: string | null; reason: string | null };
export type ResultRevision = { id: string; matchId: string; lineupRevisionId: string; whiteScore: number; blackScore: number; winnerTeamId: TeamId; submittedAt: string; actorId?: string; supersedes: string | null; reason: string | null };
export type AuditEntry = { commandId?: string; actorId?: string; type: string; recordedAt: string; changedIds: string[]; reason: string | null };
export type EventState = {
  id: string; templateId: string; schemaVersion: 1; ruleVersion: 1; revision: number; generation: number;
  name: string; date: string | null; timeZone: string | null;
  phase: "PREPARED" | "WARMUP" | "ACTIVE" | "FINISHED";
  activeRoundId: string | null; updatedAt: string;
  teams: { id: TeamId; name: string }[]; players: Player[]; courts: { id: string; number: number }[];
  rounds: Round[]; matches: Match[]; courtBlocks: { roundId: string; courtId: string; kind: string; label: string }[];
  lineups: LineupRevision[]; results: ResultRevision[]; audit: AuditEntry[];
};
export type CompetitionCommand =
  | { type: "StartWarmup" }
  | { type: "OpenFirstRound" }
  | { type: "AssignPlayer" | "ReplacePlayer"; matchId: string; slotId: string; playerId: string }
  | { type: "RemovePlayer"; matchId: string; slotId: string }
  | { type: "CancelDraft" | "StartMatch" | "BeginResultEntry"; matchId: string }
  | { type: "UndoStart"; matchId: string; reason: "ACTUAL_NOT_STARTED" }
  | { type: "UndoEndDeclaration"; matchId: string; reason: "ACCIDENTAL_END" }
  | { type: "SubmitResult"; matchId: string; lineupRevisionId: string; whiteScore: number; blackScore: number }
  | { type: "CorrectResult"; matchId: string; lineupRevisionId: string; resultRevisionId: string; whiteScore: number; blackScore: number; reason: "SCORE_ENTRY_ERROR" | "SIDES_SWAPPED" | "REVERT_CORRECTION" }
  | { type: "WithdrawCurrentResult"; matchId: string; reason: "RESULT_ENTERED_TOO_EARLY" }
  | { type: "CorrectRecordedLineup"; matchId: string; lineupRevisionId: string; participants: { slotId: string; playerId: string }[]; reason: "RECORDED_LINEUP_ERROR" }
  | { type: "AdvanceRound"; roundId: string }
  | { type: "FinishEvent" };
export type DecisionContext = { now: string; actorId: string; commandId: string };
export type RuleError = { code: string; message: string; matchId?: string };
export type Decision = { ok: true; state: EventState; changedIds: string[] } | { ok: false; error: RuleError };
export type MatchView = Match & { participants: Participant[]; result: ResultRevision | null; canStart: boolean; planningLabel: string };
export type EventProjection = { round: Round; matches: MatchView[]; completed: number; total: number; canAdvance: boolean; isCurrent: boolean; playerStates: Record<string, { status: "available" | "reserved" | "playing" | "played_this_round"; matchId?: string; label: string }> };
