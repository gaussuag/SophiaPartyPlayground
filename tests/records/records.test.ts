import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { execute, exportEvent, initializeEvent, readEvent, readReceipt, restoreEvent, resultsCsv, type RecordsContext } from "../../src/modules/records";
import type { CompetitionCommand, EventState } from "../../src/modules/competition";
import { decide } from "../../src/modules/competition";
import { initializationConfiguration, initializeConfiguredEvent } from "../../src/server/initialization";
import { SITE_TITLE } from "../../src/config/event";

let mf: Miniflare; let db: D1Database;
const now = "2026-10-28T05:00:00.000Z";
const ctx = (actorId: string | null = "admin-a", role: RecordsContext["role"] = "admin"): RecordsContext => ({ db, actorId, role, now });
const envelope = (state: EventState, command: CompetitionCommand, commandId = crypto.randomUUID()) => ({ eventId: state.id, commandId, expectedRevision: state.revision, expectedGeneration: state.generation, command });
async function initial() { const id = `test-${crypto.randomUUID()}`; return (await initializeEvent(ctx(), id)).state; }
async function apply(state: EventState, command: CompetitionCommand) { return (await execute(ctx(), envelope(state, command))).state; }
async function fill(state: EventState, matchId: string) {
  for (const slot of state.matches.find(m => m.id === matchId)!.draftSlots) {
    const p = state.players.find(p => decide(state, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: p.id }, { now, actorId: "preview", commandId: "preview" }).ok)!;
    state = await apply(state, { type: "AssignPlayer", matchId, slotId: slot.id, playerId: p.id });
  }
  return state;
}
beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('local D1 tests') } }", compatibilityDate: "2026-05-15", d1Databases: { DB: "test-db" }, cf: false });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(readFileSync("drizzle/0000_overconfident_wilson_fisk.sql", "utf8")).run();
});
afterAll(async () => { await mf?.dispose(); });
describe("real local D1 authority", () => {
  it("production initialization is closed by default and requires an authorized admin", async () => {
    const id = `release-${crypto.randomUUID()}`;
    const config = initializationConfiguration({ EVENT_ID: id, ACCEPTANCE_EVENT_ID: id + "-qa", INITIALIZATION_ENABLED: "true" });
    const request = { eventId: id, confirmName: SITE_TITLE };
    await expect(initializeConfiguredEvent(ctx(), { ...config, enabled: false }, request)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(initializeConfiguredEvent({ ...ctx(), actorId: null, role: "viewer" }, config, request)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    for (const role of ["viewer", "operator"] as const) await expect(initializeConfiguredEvent(ctx("signed-in", role), config, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(readEvent(ctx(), id)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
  });
  it("production initialization cannot import a snapshot, self-grant a role or choose arbitrary IDs", async () => {
    const id = `release-${crypto.randomUUID()}`;
    const config = initializationConfiguration({ EVENT_ID: id, ACCEPTANCE_EVENT_ID: id + "-qa", INITIALIZATION_ENABLED: "true" });
    const request = { eventId: id, confirmName: SITE_TITLE };
    for (const extra of [{ snapshot: {} }, { role: "admin" }, { actorId: "admin-a" }]) await expect(initializeConfiguredEvent(ctx(), config, { ...request, ...extra })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(initializeConfiguredEvent(ctx(), config, { ...request, confirmName: "other" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(initializeConfiguredEvent(ctx(), config, { ...request, eventId: "not-configured" })).rejects.toMatchObject({ code: "EVENT_NOT_CONFIGURED" });
    await expect(readEvent(ctx(), id)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
  });
  it("concurrent production setup creates one clean event and keeps acceptance data separate", async () => {
    const id = `release-${crypto.randomUUID()}`;
    const config = initializationConfiguration({ EVENT_ID: id, ACCEPTANCE_EVENT_ID: id + "-qa", INITIALIZATION_ENABLED: "true" });
    const request = { eventId: id, confirmName: SITE_TITLE };
    const race = await Promise.all([initializeConfiguredEvent(ctx(), config, request), initializeConfiguredEvent(ctx(), config, request)]);
    expect(race.filter(r => r.created)).toHaveLength(1);
    const pristine = race[0].state;
    expect(pristine.name).toBe(SITE_TITLE); expect(pristine.revision).toBe(0); expect(pristine.phase).toBe("PREPARED");
    expect(pristine.players).toHaveLength(14); expect(pristine.matches).toHaveLength(20);
    expect(pristine.lineups).toEqual([]); expect(pristine.results).toEqual([]); expect(pristine.audit).toEqual([]);
    expect(pristine.matches.flatMap(m => m.draftSlots).every(s => s.playerId === null)).toBe(true);
    const qa = (await initializeConfiguredEvent(ctx(), config, { ...request, eventId: id + "-qa" })).state;
    const changed = await apply(qa, { type: "OpenFirstRound" });
    expect((await readEvent(ctx(), id)).state).toEqual(pristine);
    const repeated = await initializeConfiguredEvent(ctx(), config, { ...request, eventId: qa.id });
    expect(repeated.created).toBe(false); expect(repeated.state).toEqual(changed);
    expect((await initializeEvent(ctx(), id, { name: "cannot rename existing records" })).state).toEqual(pristine);
  });
  it("B13 repeated explicit initialization never resets an existing activity", async () => {
    let state = await initial(); state = await apply(state, { type: "OpenFirstRound" });
    const again = await initializeEvent(ctx(), state.id); expect(again.state.revision).toBe(1); expect(again.state.activeRoundId).toBe("R01");
  });
  it("S02–S03 concurrent clients get one atomic winner even on different courts", async () => {
    let state = await initial(); state = await apply(state, { type: "OpenFirstRound" });
    const a = envelope(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: "WHITE-1", playerId: "W01" });
    const b = envelope(state, { type: "AssignPlayer", matchId: "M-R01-C02", slotId: "WHITE-1", playerId: "W01" });
    const results = await Promise.allSettled([execute(ctx("operator-a", "operator"), a), execute(ctx("operator-b", "operator"), b)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    const latest = (await readEvent(ctx(), state.id)).state; expect(latest.revision).toBe(state.revision + 1); expect(latest.matches.flatMap(m => m.draftSlots).filter(s => s.playerId === "W01")).toHaveLength(1);
    expect(latest.audit).toHaveLength(2);
    const independent = envelope(state, { type: "AssignPlayer", matchId: "M-R01-C03", slotId: "BLACK-1", playerId: "B02" });
    await expect(execute(ctx(), independent)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("S04–S05 same request receipt precedes stale revision and survives lost responses", async () => {
    const state = await initial(); const request = envelope(state, { type: "OpenFirstRound" });
    await execute(ctx(), request); // Deliberately discard the successful response.
    const replay = await execute(ctx(), request); expect(replay.replayed).toBe(true); expect(replay.state.revision).toBe(1); expect(replay.state.audit).toHaveLength(1);
    expect(await readReceipt(ctx(), state.id, request.commandId)).toMatchObject({ appliedRevision: 1, status: "APPLIED" });
    await expect(execute(ctx(), { ...request, command: { type: "StartWarmup" } })).rejects.toMatchObject({ code: "COMMAND_ID_REUSED" });
    await expect(execute(ctx("different-user"), request)).rejects.toMatchObject({ code: "COMMAND_ID_REUSED" });
    const concurrent = await initial(); const same = envelope(concurrent, { type: "OpenFirstRound" });
    const duplicate = await Promise.all([execute(ctx(), same), execute(ctx(), same)]); expect(duplicate[0].state.revision).toBe(1); expect(duplicate[1].state.revision).toBe(1);
  });
  it("S10 database failure leaves no state, audit or success receipt partially committed", async () => {
    const state = await initial(); const request = envelope(state, { type: "OpenFirstRound" });
    await db.prepare(`CREATE TRIGGER fail_update BEFORE UPDATE ON events WHEN OLD.event_id = '${state.id}' BEGIN SELECT RAISE(ABORT, 'injected-write-failure'); END`).run();
    try { await expect(execute(ctx(), request)).rejects.toThrow("injected-write-failure"); expect((await readEvent(ctx(), state.id)).state).toEqual(state); expect(await readReceipt(ctx(), state.id, request.commandId)).toBeNull(); }
    finally { await db.prepare("DROP TRIGGER fail_update").run(); }
  });
  it("S11–S12 requires trusted write context and rejects self-reported identity or role", async () => {
    const state = await initial(); const request = envelope(state, { type: "OpenFirstRound" });
    await expect(execute({ ...ctx(), role: "viewer", actorId: null }, request)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(execute(ctx("viewer", "viewer"), request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(execute(ctx(), { ...request, role: "admin", actorId: "admin-a" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(exportEvent(ctx("operator", "operator"), state.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const view = await readEvent(ctx("viewer", "viewer"), state.id); expect(view).not.toHaveProperty("receipts"); expect(view.state).not.toHaveProperty("receipts");
  });
  it("rejects blank/string scores server-side rather than coercing them to zero", async () => {
    let state = await initial(); state = await apply(state, { type: "OpenFirstRound" }); state = await fill(state, "M-R01-C01"); state = await apply(state, { type: "StartMatch", matchId: "M-R01-C01" }); state = await apply(state, { type: "BeginResultEntry", matchId: "M-R01-C01" });
    const request = envelope(state, { type: "SubmitResult", matchId: "M-R01-C01", lineupRevisionId: state.matches[0].activeLineupRevisionId!, whiteScore: 1, blackScore: 0 });
    await expect(execute(ctx(), { ...request, command: { ...request.command, whiteScore: "" } })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    const finished = await execute(ctx(), request); expect(finished.state.results[0].blackScore).toBe(0); expect(finished.state.results[0]).not.toHaveProperty("actorId"); expect(finished.state.audit[0]).not.toHaveProperty("actorId");
    const csv = resultsCsv(finished.state); expect(csv).toContain('"11"'.replace("11", "1")); expect(csv).toContain('"白队"');
  });
  it.each([["participant-a", "participant"], [null, "guest"]] as const)("allows %s/%s preparation and scoring while keeping management privileged", async (actorId, role) => {
    let state = await initial(); state = await apply(state, { type: "OpenFirstRound" });
    const participant = ctx(actorId, role);
    const denied = actorId ? "FORBIDDEN" : "UNAUTHENTICATED";
    const participate = async (command: CompetitionCommand) => { state = (await execute(participant, envelope(state, command))).state; };
    await participate({ type: "AssignPlayer", matchId: "M-R01-C01", slotId: "WHITE-1", playerId: "W01" });
    const transfer = envelope(state, { type: "MovePlayer", fromMatchId: "M-R01-C01", fromSlotId: "WHITE-1", matchId: "M-R01-C02", slotId: "WHITE-1", playerId: "W01" });
    state = (await execute(participant, transfer)).state;
    const replay = await execute(participant, transfer);
    expect(replay.replayed).toBe(true); expect(replay.state.revision).toBe(state.revision);
    expect(await readReceipt(participant, state.id, transfer.commandId)).toMatchObject({ appliedRevision: state.revision });
    expect(await readReceipt(ctx("participant-b", "participant"), state.id, transfer.commandId)).toBeNull();
    const invalidMove = envelope(state, { type: "MovePlayer", fromMatchId: "M-R01-C02", fromSlotId: "WHITE-1", matchId: "M-R01-C01", slotId: "WHITE-2", playerId: "W01" });
    await expect(execute(participant, invalidMove)).rejects.toMatchObject({ code: "WRONG_GENDER" });
    expect((await readEvent(participant, state.id)).state).toEqual(state);
    await participate({ type: "RemovePlayer", matchId: "M-R01-C02", slotId: "WHITE-1" });
    for (const match of state.matches.filter(m => m.roundId === state.activeRoundId)) {
      state = await fill(state, match.id);
      await expect(execute(participant, envelope(state, { type: "StartMatch", matchId: match.id }))).rejects.toMatchObject({ code: denied, status: actorId ? 403 : 401 });
      state = await apply(state, { type: "StartMatch", matchId: match.id });
      await expect(execute(participant, envelope(state, { type: "RemovePlayer", matchId: match.id, slotId: "WHITE-1" }))).rejects.toMatchObject({ code: "INVALID_PHASE" });
      const scores: CompetitionCommand = { type: "SubmitResult", matchId: match.id, lineupRevisionId: state.matches.find(m => m.id === match.id)!.activeLineupRevisionId!, whiteScore: 11, blackScore: 7 };
      const simultaneous = [envelope(state, scores), envelope(state, scores)];
      const submissions = await Promise.allSettled(simultaneous.map((request, i) => execute(ctx(actorId ? "scorer-" + i : null, role), request)));
      expect(submissions.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(submissions.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
      state = (await readEvent(participant, state.id)).state;
      const current = state.matches.find(m => m.id === match.id)!;
      expect(current.phase).toBe("COMPLETED");
      expect(state.results.filter(r => r.matchId === match.id)).toHaveLength(1);
      await expect(execute(participant, envelope(state, { ...scores, type: "CorrectResult", resultRevisionId: current.activeResultRevisionId!, reason: "SCORE_ENTRY_ERROR" }))).rejects.toMatchObject({ code: denied });
    }
    await expect(execute(participant, envelope(state, { type: "AdvanceRound", roundId: "R01" }))).rejects.toMatchObject({ code: denied });
    expect(state.rounds[0].phase).toBe("OPEN");
    state = await apply(state, { type: "AdvanceRound", roundId: "R01" });
    expect(state.activeRoundId).toBe("R02");
    expect(state.matches.filter(m => m.roundId === "R02").flatMap(m => m.draftSlots).every(s => s.playerId === null)).toBe(true);
    await expect(exportEvent(participant, state.id)).rejects.toMatchObject({ code: denied });
    await expect(initializeEvent(participant, "cannot-initialize")).rejects.toMatchObject({ code: denied });
  });
  it("does not let a participant upgrade command privileges or forge body identity", async () => {
    const state = await initial(), participant = ctx("participant", "participant");
    const commands: CompetitionCommand[] = [
      { type: "StartWarmup" }, { type: "OpenFirstRound" }, { type: "StartMatch", matchId: "M-R01-C01" },
      { type: "AdvanceRound", roundId: "R01" }, { type: "FinishEvent" },
      { type: "UndoStart", matchId: "M-R01-C01", reason: "ACTUAL_NOT_STARTED" },
      { type: "UndoEndDeclaration", matchId: "M-R01-C01", reason: "ACCIDENTAL_END" },
      { type: "WithdrawCurrentResult", matchId: "M-R01-C01", reason: "RESULT_ENTERED_TOO_EARLY" },
      { type: "CorrectRecordedLineup", matchId: "M-R01-C01", lineupRevisionId: "lineup", participants: [{ slotId: "WHITE-1", playerId: "W01" }, { slotId: "BLACK-1", playerId: "B02" }], reason: "RECORDED_LINEUP_ERROR" },
    ];
    for (const command of commands) await expect(execute(participant, envelope(state, command))).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(execute(participant, { ...envelope(state, commands[0]), role: "admin" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    const backup = await exportEvent(ctx(), state.id);
    await expect(restoreEvent(participant, state.id, { commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, confirmEventId: state.id, maintenance: true, backup })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await readEvent(participant, state.id)).state.revision).toBe(state.revision);
  });
  it("races a participant transfer against manager start without a partial move or unlocked lineup", async () => {
    let state = await initial(); state = await apply(state, { type: "OpenFirstRound" }); state = await fill(state, "M-R01-C01");
    const commands = [
      execute(ctx("participant", "participant"), envelope(state, { type: "MovePlayer", fromMatchId: "M-R01-C01", fromSlotId: "WHITE-1", matchId: "M-R01-C02", slotId: "WHITE-1", playerId: "W01" })),
      execute(ctx(), envelope(state, { type: "StartMatch", matchId: "M-R01-C01" })),
    ];
    const results = await Promise.allSettled(commands);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    const latest = (await readEvent(ctx(), state.id)).state;
    expect(latest.revision).toBe(state.revision + 1);
    const source = latest.matches[0], destination = latest.matches[1];
    expect(source.phase === "PLAYING" ? [source.draftSlots[0].playerId, destination.draftSlots[0].playerId] : [destination.draftSlots[0].playerId, source.draftSlots[0].playerId]).toEqual(["W01", null]);
    expect(latest.lineups).toHaveLength(source.phase === "PLAYING" ? 1 : 0);
  });
  it("S14 restore validates identity, increments revision, preserves pre-restore data and retires old commands", async () => {
    const original = await initial(); const backup = await exportEvent(ctx(), original.id);
    const originalCommand = envelope(original, { type: "OpenFirstRound" }); const changed = (await execute(ctx(), originalCommand)).state;
    const input = { commandId: crypto.randomUUID(), expectedRevision: changed.revision, expectedGeneration: changed.generation, confirmEventId: changed.id, maintenance: true as const, backup };
    const restored = await restoreEvent(ctx(), original.id, input);
    expect(restored.state.phase).toBe("PREPARED"); expect(restored.state.revision).toBe(changed.revision + 1); expect(restored.state.generation).toBe(1);
    expect((await exportEvent(ctx(), original.id, true)).aggregate.state.phase).toBe("ACTIVE");
    expect((await readReceipt(ctx(), original.id, originalCommand.commandId))?.status).toBe("SUPERSEDED_BY_RESTORE");
    await expect(execute(ctx(), originalCommand)).rejects.toMatchObject({ code: "RESTORE_RELOAD_REQUIRED" });
    await expect(execute(ctx(), envelope(changed, { type: "StartWarmup" }))).rejects.toMatchObject({ code: "RESTORE_RELOAD_REQUIRED" });
    const replay = await restoreEvent(ctx(), original.id, input); expect(replay.state.revision).toBe(restored.state.revision);
    const invalid = structuredClone(backup); invalid.aggregate.state.players[0].name = "fake";
    await expect(restoreEvent(ctx(), original.id, { ...input, commandId: crypto.randomUUID(), backup: invalid })).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
  });
  it("P5/S13 runs all 20 matches through real D1 and races two manual advances per round", async () => {
    let state = await initial(); state = await apply(state, { type: "StartWarmup" }); state = await apply(state, { type: "OpenFirstRound" });
    for (let round = 1; round <= 7; round++) {
      const roundId = state.activeRoundId!;
      for (const match of state.matches.filter(m => m.roundId === roundId)) {
        state = await fill(state, match.id); state = await apply(state, { type: "StartMatch", matchId: match.id }); state = await apply(state, { type: "BeginResultEntry", matchId: match.id });
        state = await apply(state, { type: "SubmitResult", matchId: match.id, lineupRevisionId: state.matches.find(m => m.id === match.id)!.activeLineupRevisionId!, whiteScore: round % 2 ? 11 : 4, blackScore: round % 2 ? 0 : 15 });
      }
      const advance = { type: "AdvanceRound" as const, roundId };
      const results = await Promise.allSettled([execute(ctx("admin-a"), envelope(state, advance)), execute(ctx("admin-b"), envelope(state, advance))]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      state = (await readEvent(ctx(), state.id)).state;
      expect(state.activeRoundId).toBe(round === 7 ? null : `R0${round + 1}`);
    }
    state = await apply(state, { type: "FinishEvent" });
    const backup = await exportEvent(ctx(), state.id); expect(state.results).toHaveLength(20); expect(state.phase).toBe("FINISHED"); expect(resultsCsv(state).split("\r\n")).toHaveLength(21);
    const size = new TextEncoder().encode(JSON.stringify(backup)).length;
    expect(size).toBeLessThan(500000);
    mkdirSync("outputs", { recursive: true }); writeFileSync("outputs/full-event-d1.json", JSON.stringify({ eventId: state.id, revision: state.revision, officialMatches: 20, participation: state.lineups.reduce((n, l) => n + l.participants.length, 0), backupBytes: size, phase: state.phase, testedAt: new Date().toISOString() }, null, 2));
    const restored = await restoreEvent(ctx(), state.id, { commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, confirmEventId: state.id, maintenance: true, backup }); expect(restored.state.matches.filter(m => m.phase === "COMPLETED")).toHaveLength(20);
  });
});
