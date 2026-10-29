import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, type EventSession } from "../../src/modules/session";
import { createEvent, decide, type EventState } from "../../src/modules/competition";
import type { CommandEnvelope } from "../../src/modules/records/protocol";
import { localCache } from "../../src/modules/session/cache";

const sessions: EventSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); vi.restoreAllMocks(); });
function server() {
  let state = createEvent(`session-${crypto.randomUUID()}`, "2026-10-28T05:00:00.000Z");
  const receipts = new Map<string, { appliedRevision: number; status: string }>();
  let mode: "normal" | "commit-then-drop" | "drop-without-commit" | "offline" = "normal";
  let posts = 0;
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (mode === "offline") throw new TypeError("offline");
    if (path.includes("/receipts/")) return Response.json({ receipt: receipts.get(path.split("/").at(-1)!) ?? null });
    if (init?.method !== "POST") return Response.json({ state: structuredClone(state), role: "operator" }, { headers: { ETag: `"${state.revision}"` } });
    posts++;
    const envelope = JSON.parse(init.body as string) as CommandEnvelope;
    if (mode === "drop-without-commit") throw new TypeError("request never arrived");
    if (envelope.expectedRevision !== state.revision || envelope.expectedGeneration !== state.generation) return Response.json({ error: { code: "REVISION_CONFLICT", message: "其他设备已更新" } }, { status: 409 });
    const decision = decide(state, envelope.command, { commandId: envelope.commandId, actorId: "operator", now: state.updatedAt });
    if (!decision.ok) return Response.json({ error: decision.error }, { status: 422 });
    state = decision.state; receipts.set(envelope.commandId, { appliedRevision: state.revision, status: "APPLIED" });
    if (mode === "commit-then-drop") throw new TypeError("successful response lost");
    return Response.json({ state, role: "operator", receipt: receipts.get(envelope.commandId) });
  });
  return { id: state.id, fetcher: fetcher as typeof fetch, get state() { return state; }, setState: (next: EventState) => { state = next; }, setMode: (m: typeof mode) => { mode = m; }, get posts() { return posts; } };
}
async function client(srv: ReturnType<typeof server>, fetcher = srv.fetcher) { const session = connect(srv.id, { fetch: fetcher, intervalMs: 100000, timeoutMs: 100 }); sessions.push(session); await session.ready; return session; }

describe("session uncertainty and local recovery", () => {
  it("S05 refresh recovers a committed response through its original receipt without reposting", async () => {
    const srv = server(); const first = await client(srv); srv.setMode("commit-then-drop");
    expect(await first.dispatch({ type: "OpenFirstRound" })).toBe(false); expect(first.getView().status).toBe("unknown-outcome"); const originalId = first.getView().pending[0].commandId;
    first.dispose(); srv.setMode("normal"); const reloaded = await client(srv);
    expect(reloaded.getView().state?.revision).toBe(1); expect(reloaded.getView().pending).toHaveLength(0); expect(reloaded.getView().status).toBe("synced"); expect(srv.posts).toBe(1);
    expect(srv.state.audit[0].commandId).toBe(originalId);
  });
  it("S06 absent receipt keeps the same identity and requires explicit retry", async () => {
    const srv = server(); const session = await client(srv); srv.setMode("drop-without-commit");
    await session.dispatch({ type: "OpenFirstRound" }); const original = session.getView().pending[0]; srv.setMode("normal");
    await session.refresh(); expect(session.getView().status).toBe("unknown-outcome"); expect(srv.posts).toBe(1);
    expect(await session.retryPending()).toBe(true); expect(srv.state.audit[0].commandId).toBe(original.commandId); expect(srv.posts).toBe(2);
  });
  it("S07 discards a read response that arrives after a newer successful command", async () => {
    const srv = server(); let release: ((response: Response) => void) | null = null;
    let hold = false;
    const fetcher = (async (url, init) => {
      if (hold && !init?.method) { const old = structuredClone(srv.state); return new Promise<Response>(resolve => { release = () => resolve(Response.json({ state: old, role: "operator" })); }); }
      return srv.fetcher(url, init);
    }) as typeof fetch;
    const session = await client(srv, fetcher); hold = true; const reading = session.refresh(); await Promise.resolve();
    await session.dispatch({ type: "OpenFirstRound" }); expect(session.getView().state?.revision).toBe(1);
    (release as unknown as (response?: Response) => void)(); await reading; expect(session.getView().state?.revision).toBe(1);
  });
  it("S08–S09 offline draft strings survive reload and retain their lineup binding", async () => {
    const srv = server(); const session = await client(srv);
    await session.saveDraft({ eventId: srv.id, matchId: "M-R01-C01", lineupRevisionId: "original-lineup", generation: 0, whiteInput: "", blackInput: "0", updatedAt: srv.state.updatedAt });
    srv.setMode("offline"); await session.refresh(); expect(session.getView().status).toBe("offline"); expect(await session.dispatch({ type: "OpenFirstRound" })).toBe(false); expect(srv.posts).toBe(0);
    session.dispose(); const reloaded = await client(srv); expect(reloaded.getView().drafts["M-R01-C01"]).toMatchObject({ whiteInput: "", blackInput: "0", lineupRevisionId: "original-lineup" }); expect(reloaded.getView().status).toBe("offline"); expect(reloaded.getView().state?.id).toBe(srv.id); expect(reloaded.getView().lastSyncedAt).not.toBeNull();
  });
  it("conflicts are never automatically rebased or replayed", async () => {
    const srv = server(); const session = await client(srv); srv.setState({ ...srv.state, revision: 4 });
    expect(await session.dispatch({ type: "OpenFirstRound" })).toBe(false); expect(session.getView().status).toBe("conflict"); expect(session.getView().pending).toHaveLength(0); expect(session.getView().state?.revision).toBe(4); expect(srv.posts).toBe(1);
    await session.refresh(); expect(session.getView().status).toBe("synced"); expect(srv.posts).toBe(1);
  });
  it("S14 restored generations retire unsubmitted old commands instead of replaying them", async () => {
    const srv = server(); const cache = localCache(srv.id);
    await cache.savePending({ eventId: srv.id, commandId: crypto.randomUUID(), expectedRevision: 0, expectedGeneration: 0, command: { type: "OpenFirstRound" } }); cache.close();
    srv.setState({ ...srv.state, revision: 10, generation: 1 });
    const session = await client(srv); expect(session.getView().status).toBe("conflict"); expect(session.getView().pending).toHaveLength(0); expect(srv.posts).toBe(0);
  });
  it("a confirmation based on an old snapshot cannot start a changed lineup", async () => {
    const srv = server(); const session = await client(srv); const basis = { revision: 0, generation: 0 }; srv.setState({ ...srv.state, revision: 1 }); await session.refresh();
    expect(await session.dispatch({ type: "OpenFirstRound" }, basis)).toBe(false); expect(session.getView().status).toBe("conflict"); expect(srv.state.audit).toHaveLength(0);
  });
  it("S16 two sessions sharing IndexedDB retain separate command identities and surface a race", async () => {
    const srv = server(); const a = await client(srv); const b = await client(srv);
    const results = await Promise.all([a.dispatch({ type: "OpenFirstRound" }), b.dispatch({ type: "OpenFirstRound" })]);
    expect(results.filter(Boolean)).toHaveLength(1); expect(srv.state.revision).toBe(1); expect([a.getView().status, b.getView().status]).toContain("conflict");
    const cache = localCache(srv.id); expect(await cache.pending()).toHaveLength(0); cache.close();
  });
});
