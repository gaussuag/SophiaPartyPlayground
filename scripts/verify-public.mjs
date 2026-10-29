import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

// Run only after Sites returns the actual public URL. This does not replace an
// independent, signed-out browser visit; it verifies the anonymous HTTP boundary.
const [baseArgument, acceptanceId, formalId, mode, ...extra] = process.argv.slice(2);
assert(!extra.length && (!mode || mode === "--active-event"), "Only --active-event is supported; omit it when verifying a pristine formal activity.");
const activeEvent = mode === "--active-event";
assert(baseArgument && acceptanceId && formalId, "Usage: node scripts/verify-public.mjs <actual-https-origin> <acceptance-event-id> <formal-event-id>");
const base = new URL(baseArgument);
assert.equal(base.protocol, "https:");
assert(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/", "Use only the returned origin, without credentials or tokens.");
assert(/^[a-zA-Z0-9_-]{1,80}$/.test(acceptanceId) && /^[a-zA-Z0-9_-]{1,80}$/.test(formalId) && acceptanceId !== formalId, "Acceptance and formal activities must be separate.");
async function request(path, payload, extraHeaders = {}) {
  const response = await fetch(new URL(path, base), { method: payload ? "POST" : "GET", credentials: "omit", redirect: "manual", headers: { ...(payload ? { "Content-Type": "application/json", Origin: base.origin } : {}), ...extraHeaders }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(20000) });
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}
const root = await request("/"); assert.equal(root.status, 200); assert.equal(root.location, null); assert(root.body.includes("Sophia Sunshine Cup")); assert(root.body.includes(formalId), "The default homepage must select the formal activity.");
const page = await request(`/?event=${acceptanceId}`); assert.equal(page.status, 200); assert.equal(page.location, null); assert(page.body.includes("Sophia Sunshine Cup"));
const read = await request(`/api/events/${acceptanceId}`); assert.equal(read.status, 200);
const view = JSON.parse(read.body); assert.equal(view.role, "viewer");
const identity = await request("/api/setup"); assert.equal(identity.status, 200);
assert.deepEqual(JSON.parse(identity.body), { authenticated: false, actorId: null, email: null, role: "viewer", initializationEnabled: false, targets: [] });
const forgedIdentity = await request("/api/setup", undefined, { "oai-authenticated-user-id": "forged-not-a-real-user", "oai-authenticated-user-email": "forged@example.invalid" });
assert.equal(forgedIdentity.status, 200); assert.deepEqual(JSON.parse(forgedIdentity.body), JSON.parse(identity.body), "Sites dispatch must ignore caller-supplied identity.");
const denied = await request(`/api/events/${acceptanceId}/commands`, { eventId: acceptanceId, commandId: crypto.randomUUID(), expectedRevision: view.state.revision, expectedGeneration: view.state.generation, command: { type: "OpenFirstRound" } });
assert.equal(denied.status, 401, "Anonymous mutations must be rejected before business execution.");
const backup = await request(`/api/events/${acceptanceId}/backup`); assert.equal(backup.status, 401);
const csv = await request(`/api/events/${acceptanceId}/results.csv`); assert.equal(csv.status, 200);
const formal = await request(`/api/events/${formalId}`); assert.equal(formal.status, 200);
const pristine = JSON.parse(formal.body).state;
assert.equal(pristine.name, "Sophia Sunshine Cup");
const formalPristine = pristine.phase === "PREPARED" && pristine.revision === 0 && pristine.lineups.length === 0 && pristine.results.length === 0 && pristine.matches.flatMap(m => m.draftSlots).every(s => s.playerId === null);
if (!activeEvent) assert(formalPristine, "Formal activity is no longer pristine. Use --active-event only for an activity already in use; never reset its records for this check.");
assert.equal(pristine.players.length, 14); assert.equal(pristine.matches.length, 20); assert.equal(pristine.courts.length, 3); assert.equal(pristine.rounds.length, 7);
const report = { testedAt: new Date().toISOString(), origin: base.origin, acceptanceId, formalId, anonymousDefaultPage: root.status, anonymousPage: page.status, loginRedirect: page.location, anonymousRead: read.status, anonymousWrite: denied.status, anonymousBackup: backup.status, publicCsv: csv.status, initializationWindowClosed: true, forgedIdentityIgnored: true, formalPristine, formalRevision: pristine.revision, activeEvent, independentBrowser: "Must be recorded separately. No Cookie, real identity or bypass token is used; a separate negative case sends a fabricated identity." };
mkdirSync("outputs", { recursive: true }); writeFileSync("outputs/public-http-checks.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
