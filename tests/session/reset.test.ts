import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, type EventSession } from "../../src/modules/session";
import { createEvent } from "../../src/modules/competition";
import type { Role } from "../../src/modules/records/protocol";
const sessions: EventSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); });
function server(role: Role = "admin") {
  let state = createEvent("reset-session-" + crypto.randomUUID(), "2026-10-31T00:00:00Z"), posts = 0, loseResponse = false;
  const receipts = new Map<string, { status: string; appliedRevision: number }>();
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("/receipts/")) return Response.json({ receipt: receipts.get(String(url).split("/").at(-1)!) ?? null });
    if (init?.method !== "POST") return Response.json({ state, role });
    posts++; const input = JSON.parse(init.body as string);
    expect(String(url)).toBe("/api/events/" + state.id + "/reset"); expect(input).not.toHaveProperty("reset"); expect(input).not.toHaveProperty("state");
    expect(input.confirmEventId).toBe(state.id); expect(input.maintenance).toBe(true);
    if (state.revision !== input.expectedRevision || state.generation !== input.expectedGeneration) return Response.json({ error: { code: "REVISION_CONFLICT", message: "确认期间记录已变化" } }, { status: 409 });
    state = { ...state, revision: state.revision + 1, generation: state.generation + 1 };
    receipts.set(input.commandId, { status: "APPLIED", appliedRevision: state.revision });
    if (loseResponse) throw new Error("reset response lost");
    return Response.json({ state, role });
  });
  return { id: state.id, fetch: transport as typeof fetch, get state() { return state; }, get posts() { return posts; }, drop: () => { loseResponse = true; }, advance: () => { state = { ...state, revision: state.revision + 1 }; } };
}
async function client(srv: ReturnType<typeof server>) { const s = connect(srv.id, { fetch: srv.fetch, intervalMs: 100000 }); sessions.push(s); await s.ready; return s; }
describe("reset uses durable maintenance commands", () => {
  it.each(["guest", "participant", "operator"] as const)("does not send a %s reset", async role => {
    const srv = server(role), s = await client(srv); expect(await s.reset({ revision: 0, generation: 0 })).toBe(false); expect(srv.posts).toBe(0);
  });
  it("sends the exact confirmed basis and refuses a newer revision", async () => {
    const srv = server(), s = await client(srv), basis = { revision: 0, generation: 0 }; srv.advance();
    expect(await s.reset(basis)).toBe(false); expect(s.getView().status).toBe("conflict"); expect(s.getView().pending).toHaveLength(0); expect(srv.state.generation).toBe(0);
  });
  it("recovers a committed reset after a lost response without resetting again", async () => {
    const srv = server(), s = await client(srv); srv.drop();
    expect(await s.reset({ revision: 0, generation: 0 })).toBe(false); expect(s.getView().status).toBe("unknown-outcome"); expect(s.getView().pending[0]).toHaveProperty("reset");
    const commandId = s.getView().pending[0].commandId; s.dispose(); const reloaded = await client(srv);
    expect(reloaded.getView().state?.generation).toBe(1); expect(reloaded.getView().pending).toHaveLength(0); expect(srv.posts).toBe(1);
    await reloaded.refresh(); await reloaded.retryPending(); expect(srv.posts).toBe(1); expect(commandId).toBeTruthy(); expect(reloaded.getView().status).toBe("synced");
  });
});
