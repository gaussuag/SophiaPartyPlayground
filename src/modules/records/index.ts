// Server-only entrypoint. App routes inject the real D1 binding and trusted identity.
import { createEvent, decide, verifySnapshot, type EventState } from "../competition";
import { envelopeSchema, type Backup, type Receipt, type Role } from "./protocol";
export type { Receipt, Role, CommandEnvelope, Backup } from "./protocol";

export type RecordsContext = { db: D1Database; actorId: string | null; role: Role; now: string };
type RecoveryPoint = { state: EventState; receipts: Record<string, Receipt> };
type Aggregate = RecoveryPoint & { beforeRestore?: RecoveryPoint };
export class RecordsError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly revision?: number) { super(message); }
}
function authorize(context: RecordsContext, admin = false): asserts context is RecordsContext & { actorId: string } {
  if (!context.actorId) throw new RecordsError("UNAUTHENTICATED", "请先登录获授权的管理账号", 401);
  if (context.role === "viewer" || admin && context.role !== "admin") throw new RecordsError("FORBIDDEN", admin ? "此操作需要活动管理员权限" : "当前账号只有查看权限", 403);
}
function validId(eventId: string) { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(eventId)) throw new RecordsError("INVALID_EVENT_ID", "活动编号无效"); }
async function load(context: RecordsContext, eventId: string): Promise<Aggregate> {
  validId(eventId);
  const row = await context.db.withSession("first-primary").prepare("SELECT snapshot_json FROM events WHERE event_id = ?").bind(eventId).first<{ snapshot_json: string }>();
  if (!row) throw new RecordsError("EVENT_NOT_FOUND", "这个活动尚未初始化", 404);
  return JSON.parse(row.snapshot_json) as Aggregate;
}
function publicState(state: EventState): EventState {
  return { ...state, results: state.results.map(({ actorId: _actor, ...r }) => r), audit: state.audit.map(({ actorId: _actor, commandId: _command, ...a }) => a) };
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
async function fingerprint(value: unknown) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))))].map(x => x.toString(16).padStart(2, "0")).join(""); }
function receiptFor(aggregate: Aggregate, commandId: string, actorId: string, hash: string): Receipt | undefined {
  const receipt = Object.hasOwn(aggregate.receipts, commandId) ? aggregate.receipts[commandId] : undefined;
  if (receipt && (receipt.actorId !== actorId || receipt.requestHash !== hash)) throw new RecordsError("COMMAND_ID_REUSED", "同一操作编号不能用于不同账号或不同请求", 409);
  if (receipt?.status === "SUPERSEDED_BY_RESTORE") throw new RecordsError("RESTORE_RELOAD_REQUIRED", "活动已从备份恢复，请重新载入并核对；旧操作不会重放", 409, aggregate.state.revision);
  return receipt;
}
async function compareAndSave(context: RecordsContext, aggregate: Aggregate, expectedRevision: number) {
  const state = aggregate.state;
  const result = await context.db.prepare("UPDATE events SET snapshot_json = ?, revision = ?, updated_at = ? WHERE event_id = ? AND revision = ?")
    .bind(JSON.stringify(aggregate), state.revision, state.updatedAt, state.id, expectedRevision).run();
  return result.meta.changes === 1;
}

export async function readEvent(context: RecordsContext, eventId: string) {
  const aggregate = await load(context, eventId);
  return { state: publicState(aggregate.state), role: context.role };
}
export async function initializeEvent(context: RecordsContext, eventId: string, options: { name?: string } = {}) {
  authorize(context, true); validId(eventId);
  const state = createEvent(eventId, context.now);
  if (options.name) state.name = options.name;
  const inserted = await context.db.prepare("INSERT INTO events (event_id, schema_version, revision, snapshot_json, updated_at) VALUES (?, 1, 0, ?, ?) ON CONFLICT(event_id) DO NOTHING")
    .bind(eventId, JSON.stringify({ state, receipts: {} }), context.now).run();
  return { ...await readEvent(context, eventId), created: inserted.meta.changes === 1 };
}
export async function execute(context: RecordsContext, input: unknown) {
  authorize(context);
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) throw new RecordsError("INVALID_REQUEST", "操作格式无效，不能提交身份、角色或整份快照");
  const envelope = parsed.data;
  const hash = await fingerprint(envelope);
  const aggregate = await load(context, envelope.eventId);
  const existing = receiptFor(aggregate, envelope.commandId, context.actorId, hash);
  if (existing) return { ...(await readEvent(context, envelope.eventId)), receipt: existing, replayed: true };
  if (aggregate.state.generation !== envelope.expectedGeneration) throw new RecordsError("RESTORE_RELOAD_REQUIRED", "活动已恢复，请重新载入并核对", 409, aggregate.state.revision);
  if (aggregate.state.revision !== envelope.expectedRevision) throw new RecordsError("REVISION_CONFLICT", "其他设备已更新记录，请核对后重新操作", 409, aggregate.state.revision);
  const decision = decide(aggregate.state, envelope.command, { now: context.now, actorId: context.actorId, commandId: envelope.commandId });
  if (!decision.ok) throw new RecordsError(decision.error.code, decision.error.message, 422);
  const receipt: Receipt = { commandId: envelope.commandId, actorId: context.actorId, requestHash: hash, appliedRevision: decision.state.revision, generation: decision.state.generation, resultRefs: decision.changedIds, status: "APPLIED" };
  const updated: Aggregate = { ...aggregate, state: decision.state, receipts: { ...aggregate.receipts, [envelope.commandId]: receipt } };
  if (!await compareAndSave(context, updated, envelope.expectedRevision)) {
    const latest = await load(context, envelope.eventId);
    const racedReceipt = receiptFor(latest, envelope.commandId, context.actorId, hash);
    if (racedReceipt) return { state: publicState(latest.state), role: context.role, receipt: racedReceipt, replayed: true };
    throw new RecordsError("REVISION_CONFLICT", "另一台设备先保存了修改，请核对后重新操作", 409, latest.state.revision);
  }
  return { state: publicState(updated.state), role: context.role, receipt, replayed: false };
}
export async function readReceipt(context: RecordsContext, eventId: string, commandId: string) {
  authorize(context);
  const aggregate = await load(context, eventId);
  const receipt = Object.hasOwn(aggregate.receipts, commandId) ? aggregate.receipts[commandId] : undefined;
  if (!receipt || receipt.actorId !== context.actorId && context.role !== "admin") return null;
  // Request hashes and other operators' identities are never part of visitor views.
  return { commandId: receipt.commandId, appliedRevision: receipt.appliedRevision, generation: receipt.generation, status: receipt.status };
}
export async function exportEvent(context: RecordsContext, eventId: string, beforeRestore = false): Promise<Backup> {
  authorize(context, true);
  const aggregate = await load(context, eventId);
  const source = beforeRestore ? aggregate.beforeRestore : aggregate;
  if (!source) throw new RecordsError("NO_RECOVERY_POINT", "尚无恢复前备份", 404);
  return { format: "sophia-party-backup-v1", exportedAt: context.now, eventId, schemaVersion: 1, revision: source.state.revision, aggregate: { state: source.state, receipts: source.receipts } };
}
export async function restoreEvent(context: RecordsContext, eventId: string, input: { commandId: string; expectedRevision: number; expectedGeneration: number; confirmEventId: string; maintenance: true; backup: Backup }) {
  authorize(context, true);
  if (!input || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.commandId) || input.confirmEventId !== eventId || input.maintenance !== true) throw new RecordsError("MAINTENANCE_REQUIRED", "请进入维护恢复并明确确认同一活动");
  const backup = input.backup;
  if (backup?.format !== "sophia-party-backup-v1" || backup.eventId !== eventId || backup.aggregate?.state?.id !== eventId || backup.schemaVersion !== 1 || backup.revision !== backup.aggregate.state.revision) throw new RecordsError("INVALID_BACKUP", "只能将完整 JSON 备份恢复到原活动");
  const error = verifySnapshot(backup.aggregate.state);
  if (error) throw new RecordsError(error.code, error.message, 422);
  if (!backup.aggregate.receipts || Array.isArray(backup.aggregate.receipts) || typeof backup.aggregate.receipts !== "object") throw new RecordsError("INVALID_BACKUP", "备份缺少操作回执");
  const hash = await fingerprint(input);
  const current = await load(context, eventId);
  const existing = receiptFor(current, input.commandId, context.actorId, hash);
  if (existing) return { state: publicState(current.state), role: context.role, receipt: existing };
  if (current.state.revision !== input.expectedRevision || current.state.generation !== input.expectedGeneration) throw new RecordsError("REVISION_CONFLICT", "维护期间记录已变化，请重新导出、核对后恢复", 409, current.state.revision);
  const state = structuredClone(backup.aggregate.state);
  state.revision = current.state.revision + 1; state.generation = current.state.generation + 1; state.updatedAt = context.now;
  state.audit.push({ commandId: input.commandId, actorId: context.actorId, type: "RestoreEvent", recordedAt: context.now, changedIds: [eventId], reason: `RESTORE_REVISION_${backup.revision}` });
  const receipts: Record<string, Receipt> = Object.create(null);
  for (const [id, receipt] of Object.entries({ ...backup.aggregate.receipts, ...current.receipts })) {
    if (!receipt || typeof receipt.actorId !== "string" || typeof receipt.requestHash !== "string" || receipt.commandId !== id || !Number.isSafeInteger(receipt.appliedRevision)) throw new RecordsError("INVALID_BACKUP", "备份操作回执无效");
    receipts[id] = { ...receipt, status: "SUPERSEDED_BY_RESTORE" };
  }
  const receipt: Receipt = { commandId: input.commandId, actorId: context.actorId, requestHash: hash, appliedRevision: state.revision, generation: state.generation, resultRefs: [eventId], status: "APPLIED" };
  receipts[input.commandId] = receipt;
  const updated: Aggregate = { state, receipts, beforeRestore: { state: current.state, receipts: current.receipts } };
  if (!await compareAndSave(context, updated, input.expectedRevision)) {
    const latest = await load(context, eventId); const raced = receiptFor(latest, input.commandId, context.actorId, hash);
    if (raced) return { state: publicState(latest.state), role: context.role, receipt: raced };
    throw new RecordsError("REVISION_CONFLICT", "恢复期间有其他操作，请重新核对", 409);
  }
  return { state: publicState(state), role: context.role, receipt };
}

export function resultsCsv(state: EventState): string {
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const rows: (string | number)[][] = [["活动", "轮次", "场地", "类型", "白队", "黑队", "白队比分", "黑队比分", "获胜队", "赛果版本"]];
  for (const match of state.matches) {
    const result = state.results.find(r => r.id === match.activeResultRevisionId);
    if (!result) continue;
    const people = state.lineups.find(l => l.id === result.lineupRevisionId)!.participants;
    rows.push([state.id, state.rounds.find(r => r.id === match.roundId)!.number, state.courts.find(c => c.id === match.courtId)!.number, match.label, people.filter(p => p.sideId === "WHITE").map(p => p.name).join(" / "), people.filter(p => p.sideId === "BLACK").map(p => p.name).join(" / "), result.whiteScore, result.blackScore, result.winnerTeamId === "WHITE" ? "白队" : "黑队", result.id]);
  }
  return `\uFEFF${rows.map(row => row.map(cell).join(",")).join("\r\n")}`;
}
