import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { connect, type EventSession } from "../../src/modules/session";
import { createEvent, decide } from "../../src/modules/competition";

let session: EventSession | undefined;
afterEach(() => { session?.dispose(); session = undefined; vi.unstubAllGlobals(); });
it("saves a command and receipt identity over HTTP when randomUUID is absent", async () => {
  let state = createEvent("local-http-crypto", "2026-10-29T00:00:00.000Z");
  const random = globalThis.crypto;
  vi.stubGlobal("crypto", { getRandomValues: random.getRandomValues.bind(random) });
  let savedId = "";
  session = connect(state.id, { intervalMs: 100000, fetch: (async (_url, init) => {
    if (init?.method === "POST") {
      const envelope = JSON.parse(init.body as string);
      savedId = envelope.commandId;
      const decision = decide(state, envelope.command, { actorId: "test", commandId: savedId, now: state.updatedAt });
      if (!decision.ok) throw new Error(decision.error.message);
      state = decision.state;
    }
    return Response.json({ state, role: "operator" });
  }) as typeof fetch });
  await session.ready;
  expect(await session.dispatch({ type: "OpenFirstRound" })).toBe(true);
  expect(savedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(state.audit[0].commandId).toBe(savedId);
  expect(session.getView().pending).toHaveLength(0);
});
