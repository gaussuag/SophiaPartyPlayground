import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { decide, teamStandings, verifySnapshot, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import { execute, exportEvent, initializeEvent, readEvent, readReceipt, resetEvent, restoreEvent, type RecordsContext } from "../../src/modules/records";
let mf: Miniflare, db: D1Database;
const ctx = (role: RecordsContext["role"] = "admin"): RecordsContext => ({ db, actorId: role === "guest" ? null : "admin-test", role, now: "2026-10-31T00:00:00Z" });
const envelope = (s: EventState, command: CompetitionCommand) => ({ eventId: s.id, commandId: crypto.randomUUID(), expectedRevision: s.revision, expectedGeneration: s.generation, command });
const resetInput = (s: EventState) => ({ commandId: crypto.randomUUID(), expectedRevision: s.revision, expectedGeneration: s.generation, confirmEventId: s.id, maintenance: true as const });
async function initial(ruleVersion: 1 | 2 = 2) { return (await initializeEvent(ctx(), "reset-" + crypto.randomUUID(), { ruleVersion, name: "Preserved activity name" })).state; }
async function apply(s: EventState, command: CompetitionCommand) { return (await execute(ctx(), envelope(s, command))).state; }
async function recorded(ruleVersion: 1 | 2) {
  let s = await initial(ruleVersion); s = await apply(s, { type: "OpenFirstRound" });
  const matchId = s.matches[0].id;
  for (const slot of s.matches[0].draftSlots) {
    const p = s.players.find(p => decide(s, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: p.id }, { now: s.updatedAt, actorId: "test", commandId: "test" }).ok)!;
    s = await apply(s, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: p.id });
  }
  s = await apply(s, { type: "StartMatch", matchId });
  return apply(s, { type: "SubmitResult", matchId, lineupRevisionId: s.matches[0].activeLineupRevisionId!, whiteScore: 15, blackScore: 11 });
}
beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() {return new Response('reset D1')} }", compatibilityDate: "2026-05-15", d1Databases: { DB: "reset-tests" }, cf: false });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(readFileSync("drizzle/0000_overconfident_wilson_fisk.sql", "utf8")).run();
});
afterAll(async () => { await mf?.dispose(); });
describe("admin reset over real D1", () => {
  it.each(["guest", "viewer", "participant", "operator"] as const)("refuses %s and keeps the activity intact", async role => {
    const s = await initial();
    await expect(resetEvent(ctx(role), s.id, resetInput(s))).rejects.toMatchObject({ code: role === "guest" ? "UNAUTHENTICATED" : "FORBIDDEN", status: role === "guest" ? 401 : 403 });
    expect((await readEvent(ctx(), s.id)).state).toEqual(s);
  });
  it("requires an exact activity confirmation and rejects client snapshots or claimed roles", async () => {
    const s = await initial(), input = resetInput(s);
    for (const invalid of [{ ...input, confirmEventId: "other" }, { ...input, maintenance: false }, { ...input, snapshot: s }, { ...input, role: "admin" }, { ...input, expectedRevision: -1 }]) {
      await expect(resetEvent(ctx(), s.id, invalid)).rejects.toMatchObject({ code: "MAINTENANCE_REQUIRED" });
    }
    expect((await readEvent(ctx(), s.id)).state).toEqual(s);
  });
  it.each([1, 2] as const)("clears v%s facts once, preserves identity and makes the previous state recoverable", async version => {
    const previous = await recorded(version), input = resetInput(previous), backup = await exportEvent(ctx(), previous.id);
    const oldCommand = Object.values(backup.aggregate.receipts)[0].commandId;
    const next = (await resetEvent(ctx(), previous.id, input)).state;
    expect(next.revision).toBe(previous.revision + 1); expect(next.generation).toBe(previous.generation + 1);
    for (const key of ["id", "name", "templateId", "ruleVersion", "players", "teams", "courts", "courtBlocks", "date", "timeZone"] as const) expect(next[key]).toEqual(previous[key]);
    expect(next.phase).toBe("PREPARED"); expect(next.activeRoundId).toBeNull();
    expect(next.rounds.every(r => r.phase === "UPCOMING" && !r.openedAt && !r.closedAt)).toBe(true);
    expect(next.matches.every(m => m.phase === "PLANNING" && !m.activeLineupRevisionId && !m.activeResultRevisionId && !m.startedAt && !m.endDeclaredAt && m.draftSlots.every(s => !s.playerId))).toBe(true);
    expect(next.matches.map(m => [m.id, m.type, m.label])).toEqual(previous.matches.map(m => [m.id, m.type, m.label]));
    expect(next.results).toEqual([]); expect(next.lineups).toEqual([]); expect(next.audit).toHaveLength(previous.audit.length + 1); expect(next.audit.at(-1)?.type).toBe("ResetEvent");
    expect(verifySnapshot(next)).toBeNull(); if (version === 2) expect(teamStandings(next).totals).toEqual({ WHITE: 0, BLACK: 0 });
    const recovery = await exportEvent(ctx(), next.id, true); expect(recovery.aggregate).toEqual(backup.aggregate);
    expect((await resetEvent(ctx(), next.id, input)).state).toEqual(next);
    await expect(resetEvent(ctx(), next.id, { ...input, expectedRevision: next.revision })).rejects.toMatchObject({ code: "COMMAND_ID_REUSED" });
    expect((await readReceipt(ctx(), next.id, oldCommand))?.status).toBe("SUPERSEDED_BY_RESTORE");
    await expect(execute(ctx(), envelope(previous, { type: "StartWarmup" }))).rejects.toMatchObject({ code: "RESTORE_RELOAD_REQUIRED" });
    const restored = (await restoreEvent(ctx(), next.id, { ...resetInput(next), backup: recovery })).state;
    expect(restored.results).toEqual(previous.results); expect(restored.lineups).toEqual(previous.lineups); expect(restored.phase).toBe(previous.phase); expect(restored.generation).toBe(next.generation + 1);
  });
  it("competes with collaboration atomically and rejects an old confirmation without overwriting new data", async () => {
    const s = await apply(await initial(), { type: "OpenFirstRound" }), input = resetInput(s);
    const move = envelope(s, { type: "AssignPlayer", matchId: s.matches[0].id, slotId: "WHITE-1", playerId: "W02" });
    const race = await Promise.allSettled([resetEvent(ctx(), s.id, input), execute(ctx("guest"), move)]);
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(race.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    const latest = (await readEvent(ctx(), s.id)).state; expect(latest.revision).toBe(s.revision + 1);
    expect(verifySnapshot(latest)).toBeNull();
    const stale = { ...resetInput(s), expectedGeneration: latest.generation };
    await expect(resetEvent(ctx(), s.id, stale)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await readEvent(ctx(), s.id)).state).toEqual(latest);
  });
  it("coalesces concurrent identical resets into one generation and one audit entry", async () => {
    const s = await initial(), input = resetInput(s);
    const results = await Promise.all([resetEvent(ctx(), s.id, input), resetEvent(ctx(), s.id, input)]);
    expect(results.map(r => r.state.revision)).toEqual([1, 1]); expect(results.map(r => r.state.generation)).toEqual([1, 1]);
    const latest = (await readEvent(ctx(), s.id)).state; expect(latest.audit.filter(a => a.type === "ResetEvent")).toHaveLength(1);
  });
});
