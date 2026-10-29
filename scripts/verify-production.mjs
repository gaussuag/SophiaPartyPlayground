import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
const base = process.env.SOPHIA_PRODUCTION_URL ?? "http://127.0.0.1:8787";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local production preview only.");
const eventId = process.argv[2] ?? "local-sophia";
async function request(url, init) { const response = await fetch(base + url, { ...init, signal: AbortSignal.timeout(15000) }); const body = await response.text(); return { status: response.status, body }; }
const read = await request(`/api/events/${eventId}`); assert.equal(read.status, 200);
const view = JSON.parse(read.body); assert.equal(view.role, "viewer");
const forged = await request(`/api/events/${eventId}/commands`, { method: "POST", headers: { "Content-Type": "application/json", cookie: "__sites_local_auth=1", "oai-authenticated-user-id": "local_seedy", "oai-authenticated-user-email": "seedy@sites.test" }, body: JSON.stringify({ eventId, commandId: crypto.randomUUID(), expectedRevision: view.state.revision, expectedGeneration: view.state.generation, command: { type: "FinishEvent" } }) });
assert.equal(forged.status, 401);
const initialize = await request("/api/local/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: "local-production-denied" }) }); assert.equal(initialize.status, 404);
const page = await request(`/?event=${eventId}`); assert.equal(page.status, 200); assert(page.body.includes("SOPHIA"));
const rejectedBodies = [
  { status: 403, headers: { "Content-Type": "application/json", origin: "https://other.invalid" }, body: JSON.stringify({ eventId }) },
  { status: 400, headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ eventId }) },
  { status: 413, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, padding: "x".repeat(20000) }) },
];
for (const check of rejectedBodies) {
  const denied = await request(`/api/events/${eventId}/commands`, { method: "POST", headers: check.headers, body: check.body });
  assert.equal(denied.status, check.status);
  // Regression: rejecting a POST must not leave a later SSR stream hanging.
  assert.equal((await request(`/?event=${eventId}`)).status, 200);
}
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(directory, e.name)) : [path.join(directory, e.name)]); }
const clientFiles = files("dist/client").filter(f => /\.(js|css)$/.test(f));
const serverFiles = files("dist/server").filter(f => /\.js$/.test(f));
for (const file of [...clientFiles, ...serverFiles]) {
  const source = readFileSync(file, "utf8"); for (const forbidden of ["local_seedy", "seedy@sites.test", "__sites_local_auth"]) assert(!source.includes(forbidden), `${forbidden} must be absent from ${file}`);
}
for (const file of clientFiles) { const source = readFileSync(file, "utf8"); for (const forbidden of ["OPERATOR_IDS", "ADMIN_IDS", "snapshot_json"]) assert(!source.includes(forbidden), `Server implementation leaked into ${file}`); }
const compressedBytes = clientFiles.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0); assert(compressedBytes < 5 * 1024 * 1024);
const report = { testedAt: new Date().toISOString(), base, eventId, read: read.status, role: view.role, revision: view.state.revision, page: page.status, forgedIdentityWrite: forged.status, developmentInitialization: initialize.status, rejectedBodiesThenSsr: rejectedBodies.map(c => c.status), developmentIdentityLiteralsInBuild: false, serverImplementationInClient: false, clientGzipBytes: compressedBytes };
mkdirSync("outputs", { recursive: true }); writeFileSync("outputs/production-checks.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
