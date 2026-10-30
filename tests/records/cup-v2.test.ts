import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createEvent, decide, teamStandings, verifySnapshot, type EventState, type CompetitionCommand } from "../../src/modules/competition";
import { execute, initializeEvent, readEvent, exportEvent, restoreEvent, resultsCsv, type RecordsContext } from "../../src/modules/records";
let mf: Miniflare, db: D1Database;
const context = (role: RecordsContext["role"] = "admin"): RecordsContext => ({ db, actorId: role === "guest" ? null : "approved-test-admin", role, now: "2026-10-30T00:00:00Z" });
const envelope = (state: EventState, command: CompetitionCommand) => ({ eventId: state.id, commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, command });
beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() {return new Response('v2 D1')} }", compatibilityDate: "2026-05-15", d1Databases: { DB: "cup-v2-tests" }, cf: false });
  db = await mf.getD1Database("DB") as unknown as D1Database; await db.prepare(readFileSync("drizzle/0000_overconfident_wilson_fisk.sql", "utf8")).run();
});
afterAll(async () => { await mf?.dispose(); });
describe("new cup over real D1", () => {
  it("initializes once and preserves an existing legacy activity even if requested with new defaults", async () => {
    const id = `legacy-${crypto.randomUUID()}`, old = await initializeEvent(context(), id, { ruleVersion: 1 });
    expect((await initializeEvent(context(), id)).state).toEqual(old.state);
    const fresh = await initializeEvent(context(), `new-${crypto.randomUUID()}`); expect(fresh.state.ruleVersion).toBe(2); expect(fresh.state.matches).toHaveLength(21);
  });
  it("rejects a valid legacy-format snapshot transplanted into a v2 activity", async () => {
    const state = (await initializeEvent(context(), `version-${crypto.randomUUID()}`)).state;
    const backup = await exportEvent(context(), state.id); backup.aggregate.state = createEvent(state.id, state.updatedAt, 1);
    await expect(restoreEvent(context(), state.id, { commandId: crypto.randomUUID(), expectedRevision: 0, expectedGeneration: 0, confirmEventId: state.id, maintenance: true, backup })).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    expect((await readEvent(context(), state.id)).state).toEqual(state);
  });
  it("races Sophia between opposite sides, commits once, and replays the original command", async () => {
    let state = (await initializeEvent(context(), `race-${crypto.randomUUID()}`)).state;
    state = (await execute(context(), envelope(state, { type: "OpenFirstRound" }))).state;
    const requests = (["WHITE", "BLACK"] as const).map(side => envelope(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side}-1`, playerId: "B01" }));
    const race = await Promise.allSettled(requests.map(request => execute(context("guest"), request)));
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(race.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    const winner = requests[race.findIndex(r => r.status === "fulfilled")]; const replay = await execute(context("guest"), winner);
    expect(replay.replayed).toBe(true); expect(replay.state.matches.flatMap(m => m.draftSlots).filter(s => s.playerId === "B01")).toHaveLength(1);
    await expect(execute(context("guest"), envelope(replay.state, { type: "StartMatch", matchId: "M-R01-C01" }))).rejects.toMatchObject({ status: 401 });
  });
  it("runs 21 matches with public collaboration, computes corrections and CSV from effective results, and restores v2", async () => {
    let state = (await initializeEvent(context(), `complete-${crypto.randomUUID()}`)).state;
    const apply = async (command: CompetitionCommand, guest = false) => { state = (await execute(context(guest ? "guest" : "admin"), envelope(state, command))).state; };
    await apply({ type: "OpenFirstRound" });
    for (let number = 1; number <= 7; number++) {
      const roundId = state.activeRoundId!;
      await apply({ type: "AssignPlayer", matchId: `M-${roundId}-C01`, slotId: number % 2 ? "WHITE-1" : "BLACK-2", playerId: "B01" }, true);
      for (const scheduled of state.matches.filter(m => m.roundId === roundId)) {
        for (const slot of scheduled.draftSlots) {
          if (slot.playerId) continue;
          const p = state.players.find(p => decide(state, { type: "AssignPlayer", matchId: scheduled.id, slotId: slot.id, playerId: p.id }, { now: state.updatedAt, actorId: "preview", commandId: "preview" }).ok)!;
          await apply({ type: "AssignPlayer", matchId: scheduled.id, slotId: slot.id, playerId: p.id }, true);
        }
        await apply({ type: "StartMatch", matchId: scheduled.id });
        await apply({ type: "SubmitResult", matchId: scheduled.id, lineupRevisionId: state.matches.find(m => m.id === scheduled.id)!.activeLineupRevisionId!, whiteScore: number % 2 ? 11 : 15, blackScore: 8 }, true);
      }
      await apply({ type: "AdvanceRound", roundId });
    }
    await apply({ type: "FinishEvent" }); expect(teamStandings(state).totals).toEqual({ WHITE: 28, BLACK: 0 });
    const first = state.matches[0];
    const request = envelope(state, { type: "CorrectResult", matchId: first.id, lineupRevisionId: first.activeLineupRevisionId!, resultRevisionId: first.activeResultRevisionId!, whiteScore: 10, blackScore: 11, reason: "SCORE_ENTRY_ERROR" });
    state = (await execute(context(), request)).state; expect(teamStandings(state).totals).toEqual({ WHITE: 26, BLACK: 2 });
    expect((await execute(context(), request)).replayed).toBe(true); const peer = (await readEvent(context("guest"), state.id)).state; expect(teamStandings(peer)).toEqual(teamStandings(state)); expect(peer.results.every(r => !("actorId" in r))).toBe(true); expect(peer.audit.every(a => !("actorId" in a) && !("commandId" in a))).toBe(true);
    expect(resultsCsv(state).split("\r\n")).toHaveLength(22); expect(resultsCsv(state)).toContain('"胜方积分"'); expect(resultsCsv(state)).toContain('"黑队","' + state.matches[0].activeResultRevisionId + '","2","白队"');
    const backup = await exportEvent(context(), state.id); expect(verifySnapshot(backup.aggregate.state)).toBeNull();
    const restored = await restoreEvent(context(), state.id, { commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, confirmEventId: state.id, maintenance: true, backup });
    expect(teamStandings(restored.state).totals).toEqual({ WHITE: 26, BLACK: 2 }); expect(restored.state.generation).toBe(1);
  });
});
