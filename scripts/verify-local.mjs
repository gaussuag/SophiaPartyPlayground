import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.SOPHIA_LOCAL_URL ?? "http://127.0.0.1:5173";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Only local previews may be tested.");
const eventId = `local-http-${crypto.randomUUID()}`;
const startedAt = Date.now();
const checks = [];
const signin = await fetch(`${base}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = signin.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "Start the development preview; built previews intentionally have no mock sign-in.");
async function request(path, payload, authenticated = true, extraHeaders = {}) {
  const response = await fetch(`${base}${path}`, { method: payload === undefined ? "GET" : "POST", headers: { ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...(authenticated ? { cookie } : {}), ...extraHeaders }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}
const initialized = await request("/api/local/initialize", { eventId }); assert.equal(initialized.response.status, 200);
let state = initialized.data.state;
const root = `/api/events/${eventId}`;
const envelope = command => ({ eventId, commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, command });
async function command(command) { const result = await request(`${root}/commands`, envelope(command)); assert.equal(result.response.status, 200, JSON.stringify(result.data)); state = result.data.state; return result.data; }
const initialBackup = (await request(`${root}/backup`)).data;
const viewer = await request(root, undefined, false); assert.equal(viewer.data.role, "viewer"); assert(!("receipts" in viewer.data.state));
const conditional = await request(root, undefined, false, { "If-None-Match": viewer.response.headers.get("etag") }); assert.equal(conditional.response.status, 304);
const forged = await request(`${root}/commands`, envelope({ type: "OpenFirstRound" }), false, { "oai-authenticated-user-id": "local_seedy", "oai-authenticated-user-email": "seedy@sites.test" }); assert.equal(forged.response.status, 401);
const viewerWrite = await request(`${root}/commands`, envelope({ type: "OpenFirstRound" }), false); assert.equal(viewerWrite.response.status, 401);
const spoofBody = await request(`${root}/commands`, { ...envelope({ type: "OpenFirstRound" }), role: "admin", actorId: "local_seedy" }); assert.equal(spoofBody.response.status, 400);
const csrf = await request(`${root}/commands`, envelope({ type: "OpenFirstRound" }), true, { origin: "https://other.invalid" }); assert.equal(csrf.response.status, 403);
checks.push("anonymous read, ETag 304, forged headers/body rejected, cross-origin write rejected");
await command({ type: "OpenFirstRound" });
const racing = ["C01", "C02"].map(court => envelope({ type: "AssignPlayer", matchId: `M-R01-${court}`, slotId: "WHITE-1", playerId: "W01" }));
const race = await Promise.all(racing.map(e => request(`${root}/commands`, e))); assert.deepEqual(race.map(r => r.response.status).sort(), [200, 409]);
const winning = racing[race.findIndex(r => r.response.status === 200)];
state = (await request(root)).data.state;
const replay = await request(`${root}/commands`, winning); assert.equal(replay.response.status, 200); assert.equal(replay.data.replayed, true); assert.equal(replay.data.state.revision, state.revision);
assert.equal((await request(`${root}/receipts/${winning.commandId}`)).data.receipt.appliedRevision, state.revision);
const collision = await request(`${root}/commands`, { ...winning, command: { type: "StartWarmup" } }); assert.equal(collision.response.status, 409);
checks.push("HTTP race commits one reservation, old revision replay returns receipt, ID collision rejected");
await command({ type: "CancelDraft", matchId: winning.command.matchId });
for (let n = 1; n <= 7; n++) {
  for (const scheduled of state.matches.filter(m => m.roundId === state.activeRoundId)) {
    for (const slot of scheduled.draftSlots) {
      const used = state.matches.filter(m => m.roundId === scheduled.roundId).flatMap(m => m.phase === "PLANNING" ? m.draftSlots.map(s => s.playerId) : state.lineups.find(l => l.id === m.activeLineupRevisionId).participants.map(p => p.playerId));
      const player = state.players.find(p => p.teamId === slot.sideId && (!slot.gender || slot.gender === p.gender) && !used.includes(p.id));
      assert(player, "The fixture must leave the remaining schedule feasible.");
      await command({ type: "AssignPlayer", matchId: scheduled.id, slotId: slot.id, playerId: player.id });
    }
    await command({ type: "StartMatch", matchId: scheduled.id });
    await command({ type: "BeginResultEntry", matchId: scheduled.id });
    const match = state.matches.find(m => m.id === scheduled.id);
    const scores = { matchId: match.id, lineupRevisionId: match.activeLineupRevisionId, whiteScore: 11, blackScore: 0 };
    if (n === 1 && scheduled.courtId === "C01") {
      const bad = await request(`${root}/commands`, envelope({ type: "SubmitResult", ...scores, whiteScore: "" })); assert.equal(bad.response.status, 400);
      const equal = await request(`${root}/commands`, envelope({ type: "SubmitResult", ...scores, blackScore: 11 })); assert.equal(equal.response.status, 422);
    }
    await command({ type: "SubmitResult", ...scores });
  }
  const roundId = state.activeRoundId;
  const advances = await Promise.all([request(`${root}/commands`, envelope({ type: "AdvanceRound", roundId })), request(`${root}/commands`, envelope({ type: "AdvanceRound", roundId }))]);
  assert.deepEqual(advances.map(a => a.response.status).sort(), [200, 409]); state = (await request(root)).data.state;
  assert.equal(state.activeRoundId, n === 7 ? null : `R0${n + 1}`);
}
await command({ type: "FinishEvent" });
assert.equal(state.results.length, 20); assert.equal(state.rounds.length, 7); assert.equal(state.phase, "FINISHED");
const historical = state.matches[0];
await command({ type: "CorrectResult", matchId: historical.id, lineupRevisionId: historical.activeLineupRevisionId, resultRevisionId: historical.activeResultRevisionId, whiteScore: 9, blackScore: 11, reason: "SCORE_ENTRY_ERROR" });
assert.equal(state.activeRoundId, null); assert.equal(state.results.length, 21);
checks.push("20 matches / 7 rounds over real HTTP and D1, every advance raced, no eighth round, historical correction");
const finalBackup = (await request(`${root}/backup`)).data;
const csv = await request(`${root}/results.csv`, undefined, false); assert.equal(csv.response.status, 200); assert.equal(csv.data.split("\r\n").length, 21);
mkdirSync("outputs", { recursive: true });
writeFileSync("outputs/http-event-backup.json", JSON.stringify(finalBackup)); writeFileSync("outputs/http-results.csv", csv.data);
const restored = await request(`${root}/restore`, { commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, confirmEventId: eventId, maintenance: true, backup: initialBackup });
assert.equal(restored.response.status, 200); assert.equal(restored.data.state.phase, "PREPARED"); assert.equal(restored.data.state.revision, state.revision + 1);
assert.equal((await request(`${root}/backup?beforeRestore=1`)).data.aggregate.state.phase, "FINISHED");
checks.push("CSV export, JSON export/restore to same ID, monotonic revision and durable pre-restore backup");
const report = { testedAt: new Date().toISOString(), base, eventId, checks, completedMatches: 20, participation: state.lineups.reduce((n, l) => n + l.participants.length, 0), backupBytes: Buffer.byteLength(JSON.stringify(finalBackup)), durationMs: Date.now() - startedAt, restoredRevision: restored.data.state.revision };
writeFileSync("outputs/http-checks.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
