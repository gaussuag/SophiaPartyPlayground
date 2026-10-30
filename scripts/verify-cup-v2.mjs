import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.SOPHIA_LOCAL_URL ?? "http://127.0.0.1:5173";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const sign = await fetch(`${base}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = sign.headers.get("set-cookie")?.split(";")[0]; assert(cookie);
const id = `local-cup-v2-${crypto.randomUUID()}`;
async function request(path, payload, admin = true) {
  const r = await fetch(base + path, { method: payload ? "POST" : "GET", headers: { ...(payload ? { "Content-Type": "application/json" } : {}), ...(admin ? { cookie } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: r.status, data };
}
let r = await request("/api/local/initialize", { eventId: id }); assert.equal(r.status, 200); let state = r.data.state;
assert.equal(state.ruleVersion, 2); assert.equal(state.matches.length, 21); assert.equal(state.players.length, 13);
const root = `/api/events/${id}`, envelope = command => ({ eventId: id, commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, command });
async function apply(command, admin = false) { const r = await request(root + "/commands", envelope(command), admin); assert.equal(r.status, 200, JSON.stringify(r.data)); state = r.data.state; return r; }
const read = async () => (await request(root, undefined, false)).data.state;
await apply({ type: "OpenFirstRound" }, true);
const raceRequests = ["WHITE", "BLACK"].map(side => envelope({ type: "AssignPlayer", matchId: "M-R01-C01", slotId: `${side}-1`, playerId: "B01" }));
const race = await Promise.all(raceRequests.map(q => request(root + "/commands", q, false))); assert.deepEqual(race.map(r => r.status).sort(), [200, 409]); state = await read();
const winner = raceRequests[race.findIndex(r => r.status === 200)]; assert((await request(root + "/commands", winner, false)).data.replayed);
await apply({ type: "CancelDraft", matchId: "M-R01-C01" });
const denied = await request(root + "/commands", envelope({ type: "StartMatch", matchId: "M-R01-C01" }), false); assert.equal(denied.status, 401);
const expected = { WHITE: 0, BLACK: 0 };
for (let number = 1; number <= 7; number++) {
  const roundId = state.activeRoundId;
  if (!(number % 2)) {
    const refused = await request(root + "/commands", envelope({ type: "AssignPlayer", matchId: `M-${roundId}-C01`, slotId: "WHITE-2", playerId: "B01" }), false);
    assert.equal(refused.status, 422); assert.equal(refused.data.error.code, "ROUND_INFEASIBLE");
  }
  const plan = number % 2 ? [[number % 4 === 1 ? "B01" : "W02", "W04", number % 4 === 1 ? "B03" : "B01", "B07"], ["W01", "W03", "B02", "B04"], ["W06", "B05"]] : [["W01", "W02", "B02", "B03"], ["W03", "W04", "B04", "B07"], ["W05", "B01"]];
  for (const [index, scheduled] of state.matches.filter(m => m.roundId === roundId).entries()) {
    for (const [i, slot] of scheduled.draftSlots.entries()) await apply({ type: "AssignPlayer", matchId: scheduled.id, slotId: slot.id, playerId: plan[index][i] });
    await apply({ type: "StartMatch", matchId: scheduled.id }, true);
    const match = state.matches.find(m => m.id === scheduled.id), lineup = state.lineups.find(l => l.id === match.activeLineupRevisionId);
    const whiteScore = index === 1 ? 8 : number % 2 ? 11 : 15, blackScore = index === 1 ? 15 : 7;
    const q = envelope({ type: "SubmitResult", matchId: match.id, lineupRevisionId: match.activeLineupRevisionId, whiteScore, blackScore });
    const saved = await request(root + "/commands", q, false); assert.equal(saved.status, 200); state = saved.data.state;
    const duplicate = await request(root + "/commands", q, false); assert(duplicate.data.replayed); assert.equal(duplicate.data.state.revision, state.revision);
    expected[whiteScore > blackScore ? "WHITE" : "BLACK"] += lineup.participants.some(p => p.playerId === "B01") ? 2 : 1;
    const peer = await read(); assert.deepEqual(peer, state);
  }
  assert.equal(state.activeRoundId, roundId);
  const advances = await Promise.all([request(root + "/commands", envelope({ type: "AdvanceRound", roundId })), request(root + "/commands", envelope({ type: "AdvanceRound", roundId }))]); assert.deepEqual(advances.map(r => r.status).sort(), [200, 409]); state = await read();
}
await apply({ type: "FinishEvent" }, true); assert.equal(state.results.length, 21);
const m = state.matches[0]; await apply({ type: "CorrectResult", matchId: m.id, lineupRevisionId: m.activeLineupRevisionId, resultRevisionId: m.activeResultRevisionId, whiteScore: 9, blackScore: 11, reason: "SCORE_ENTRY_ERROR" }, true); expected.WHITE -= 2; expected.BLACK += 2;
const backup = await request(root + "/backup"), csv = await request(root + "/results.csv", undefined, false); assert.equal(backup.status, 200); assert.equal(csv.status, 200); assert.equal(csv.data.split("\r\n").length, 22);
assert(csv.data.includes('"胜方积分"'));
const restored = await request(root + "/restore", { commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, confirmEventId: id, maintenance: true, backup: backup.data }); assert.equal(restored.status, 200); assert.equal(restored.data.state.results.length, 22);
mkdirSync("outputs/cup-v2", { recursive: true }); writeFileSync("outputs/cup-v2/http.json", JSON.stringify({ eventId: id, revision: restored.data.state.revision, generation: restored.data.state.generation, matches: 21, resultsWithCorrection: 22, participation: 70, expectedPoints: expected, checks: ["anonymous collaboration", "Sophia opposite-side race", "idempotent score replay", "even round feasibility", "21 matches", "peer state equality", "7 advance races", "historical correction", "CSV", "backup and restore"] }, null, 2)); console.log(JSON.stringify({ id, matches: 21, expectedPoints: expected, revision: restored.data.state.revision }));
