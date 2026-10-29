import { z } from "zod";
import type { CompetitionCommand, EventState } from "../competition";

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:-]+$/);
const match = { matchId: id };
const score = { ...match, lineupRevisionId: id, whiteScore: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), blackScore: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) };
const commandSchema: z.ZodType<CompetitionCommand> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("StartWarmup") }).strict(),
  z.object({ type: z.literal("OpenFirstRound") }).strict(),
  z.object({ type: z.literal("AssignPlayer"), ...match, slotId: id, playerId: id }).strict(),
  z.object({ type: z.literal("ReplacePlayer"), ...match, slotId: id, playerId: id }).strict(),
  z.object({ type: z.literal("RemovePlayer"), ...match, slotId: id }).strict(),
  z.object({ type: z.literal("CancelDraft"), ...match }).strict(),
  z.object({ type: z.literal("StartMatch"), ...match }).strict(),
  z.object({ type: z.literal("BeginResultEntry"), ...match }).strict(),
  z.object({ type: z.literal("UndoStart"), ...match, reason: z.literal("ACTUAL_NOT_STARTED") }).strict(),
  z.object({ type: z.literal("UndoEndDeclaration"), ...match, reason: z.literal("ACCIDENTAL_END") }).strict(),
  z.object({ type: z.literal("SubmitResult"), ...score }).strict(),
  z.object({ type: z.literal("CorrectResult"), ...score, resultRevisionId: id, reason: z.enum(["SCORE_ENTRY_ERROR", "SIDES_SWAPPED", "REVERT_CORRECTION"]) }).strict(),
  z.object({ type: z.literal("WithdrawCurrentResult"), ...match, reason: z.literal("RESULT_ENTERED_TOO_EARLY") }).strict(),
  z.object({ type: z.literal("CorrectRecordedLineup"), ...match, lineupRevisionId: id, participants: z.array(z.object({ slotId: id, playerId: id }).strict()).min(2).max(4), reason: z.literal("RECORDED_LINEUP_ERROR") }).strict(),
  z.object({ type: z.literal("AdvanceRound"), roundId: id }).strict(),
  z.object({ type: z.literal("FinishEvent") }).strict(),
]);
export const envelopeSchema = z.object({ eventId: id.max(80), commandId: id, expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), expectedGeneration: z.number().int().nonnegative(), command: commandSchema }).strict();
export type CommandEnvelope = z.infer<typeof envelopeSchema>;
export type Receipt = { commandId: string; actorId: string; requestHash: string; appliedRevision: number; generation: number; resultRefs: string[]; status: "APPLIED" | "SUPERSEDED_BY_RESTORE" };
export type Role = "viewer" | "operator" | "admin";
export type Backup = { format: "sophia-party-backup-v1"; exportedAt: string; eventId: string; schemaVersion: 1; revision: number; aggregate: { state: EventState; receipts: Record<string, Receipt> } };
export type RestoreEnvelope = { eventId: string; commandId: string; expectedRevision: number; expectedGeneration: number; restore: { confirmEventId: string; maintenance: true; backup: Backup } };
export type PendingEnvelope = CommandEnvelope | RestoreEnvelope;
