import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, type EventSession } from "../../src/modules/session";
import { localCache } from "../../src/modules/session/cache";
import { decide, project, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import type { CommandEnvelope } from "../../src/modules/records/protocol";
import { AvatarMotion } from "../../src/modules/venue/avatar-motion";
import { playerPlacement, worldLayout } from "../../src/modules/venue/world";
import { readyForRound, step } from "../fixtures/event";

const sessions: EventSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); vi.restoreAllMocks(); });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Public session seam + real rules, IndexedDB, placement and walking code.
function server(initial = readyForRound(1)) {
  let state = { ...initial, id: `avatar-preview-${crypto.randomUUID()}` };
  let mode: "normal" | "reject" | "drop-before-commit" | "drop-after-commit" = "normal";
  let readOverride: EventState | null = null;
  let held: { arrived: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | null = null;
  const posts: CommandEnvelope[] = [], receipts = new Map<string, { status: string; appliedRevision: number }>();
  const fetcher = (async (input, init) => {
    const url = String(input);
    if (url.includes("/receipts/")) return Response.json({ receipt: receipts.get(url.split("/").at(-1)!) ?? null });
    if (init?.method !== "POST") return Response.json({ state: structuredClone(readOverride ?? state), role: "guest" });
    const envelope = JSON.parse(init.body as string) as CommandEnvelope;
    posts.push(envelope);
    if (held) { const gate = held; gate.arrived.resolve(); await gate.released.promise; held = null; }
    if (mode === "reject") return Response.json({ error: { code: "WRITE_REJECTED", message: "保存被拒绝" } }, { status: 422 });
    if (mode === "drop-before-commit") throw new TypeError("request did not arrive");
    if (envelope.expectedRevision !== state.revision || envelope.expectedGeneration !== state.generation) return Response.json({ error: { code: "REVISION_CONFLICT", message: "其他设备已更新" } }, { status: 409 });
    const decision = decide(state, envelope.command, { actorId: "anonymous-visitor", commandId: envelope.commandId, now: state.updatedAt });
    if (!decision.ok) return Response.json({ error: decision.error }, { status: 422 });
    state = decision.state;
    receipts.set(envelope.commandId, { status: "APPLIED", appliedRevision: state.revision });
    if (mode === "drop-after-commit") throw new TypeError("successful response lost");
    return Response.json({ state: structuredClone(state), role: "guest" });
  }) as typeof fetch;
  return {
    get state() { return state; }, posts, fetcher, receipts,
    mode(next: typeof mode) { mode = next; }, lag(state: EventState | null) { readOverride = state; },
    remote(command: CompetitionCommand) { state = step(state, command); },
    restore() { state = { ...state, revision: state.revision + 1, generation: state.generation + 1 }; },
    hold() { const gate = { arrived: deferred(), released: deferred() }; held = gate; return { received: gate.arrived.promise, release: gate.released.resolve }; },
  };
}
const layout = worldLayout(390, 844);
function placement(state: EventState, playerId: string) { return playerPlacement(state, project(state), playerId, layout); }
async function client(srv: ReturnType<typeof server>, ids = ["W01"]) {
  const session = connect(srv.state.id, { fetch: srv.fetcher, intervalMs: 100000, timeoutMs: 2000 });
  sessions.push(session); await session.ready;
  const context = (state: EventState) => `${state.id}:${state.generation}:${state.activeRoundId}`;
  const initial = session.getView();
  const motions = new Map(ids.map(id => { const pose = placement(initial.arrangement?.state ?? initial.state!, id); return [id, new AvatarMotion(pose.position, pose.facing, context(initial.state!))]; }));
  const changes: { playerId: string; revision: number; status: string }[] = [];
  session.subscribe(() => {
    const view = session.getView(); if (!view.state) return;
    for (const [id, motion] of motions) {
      const pose = placement(view.arrangement?.state ?? view.state, id);
      if (motion.destination.some((n, i) => n !== pose.position[i])) changes.push({ playerId: id, revision: view.state.revision, status: view.status });
      motion.retarget(pose.position, pose.facing, layout, context(view.state));
    }
  });
  return { session, motions, changes, advance(frames: number) { for (let i = 0; i < frames; i++) motions.forEach(m => m.step(1 / 60)); } };
}
function assignment(state: EventState, playerId = "W01", matchIndex = 0): CompetitionCommand & { matchId: string; slotId: string } {
  const match = project(state).matches[matchIndex], player = state.players.find(p => p.id === playerId)!;
  const slot = match.draftSlots.find(s => s.sideId === player.teamId && (!s.gender || s.gender === player.gender))!;
  return { type: "AssignPlayer", matchId: match.id, slotId: slot.id, playerId };
}

describe("local arrangement prediction converges to authority", () => {
  it("walks synchronously before persistence/network; observers and confirmed cache wait for the server", async () => {
    const srv = server(), owner = await client(srv), observer = await client(srv);
    const { session, motions, changes, advance } = owner, motion = motions.get("W01")!;
    const waiting = [...motion.destination], before = session.getView().state!, gate = srv.hold();
    const save = session.dispatch(assignment(srv.state));
    expect(motion.walking).toBe(true); expect(srv.posts).toHaveLength(0);
    expect(session.getView().state).toBe(before); expect(session.getView().status).toBe("saving");
    expect(await session.dispatch(assignment(srv.state, "W03"))).toBe(false);
    await gate.received;
    const cache = localCache(srv.state.id);
    expect(await cache.snapshot()).toEqual(before); expect(await cache.pending()).toHaveLength(1); cache.close();
    await observer.session.refresh(); expect(observer.motions.get("W01")!.destination).toEqual(waiting);
    advance(30); const visible = [...motion.position], travelled = motion.travelled;
    gate.release(); expect(await save).toBe(true);
    expect(motion.position).toEqual(visible); expect(motion.travelled).toBe(travelled); expect(changes).toHaveLength(1);
    expect(session.getView().arrangement).toBeNull();
    await observer.session.refresh(); expect(observer.motions.get("W01")!.walking).toBe(true);
    advance(600); expect(motion.position).toEqual(placement(srv.state, "W01").position); expect(motion.moving).toBe(false);
    expect(srv.posts).toHaveLength(1);
  });

  it("a definite rejection smoothly returns from the current visible position", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    const waiting = [...motion.destination], revision = srv.state.revision, gate = srv.hold();
    srv.mode("reject"); const save = session.dispatch(assignment(srv.state)); await gate.received;
    advance(45); const visible = [...motion.position]; expect(visible).not.toEqual(waiting);
    gate.release(); expect(await save).toBe(false);
    expect(motion.position).toEqual(visible); expect(motion.destination).toEqual(waiting); expect(motion.walking).toBe(true);
    expect(session.getView().state!.revision).toBe(revision); expect(session.getView().arrangement).toBeNull();
    expect(session.getView().errorCode).toBe("WRITE_REJECTED"); expect(session.getView().pending).toHaveLength(0);
    expect(changes).toHaveLength(2); advance(600); expect(motion.position).toEqual(waiting);
  });

  it("a competing occupant wins; conflict correction never overwrites the newer lineup", async () => {
    const srv = server(), { session, motions, advance } = await client(srv, ["W01", "W03"]), motion = motions.get("W01")!;
    const waiting = [...motion.destination], gate = srv.hold();
    const save = session.dispatch(assignment(srv.state)); await gate.received; advance(35);
    const visible = [...motion.position]; srv.remote(assignment(srv.state, "W03"));
    gate.release(); expect(await save).toBe(false);
    expect(session.getView().status).toBe("conflict"); expect(session.getView().state).toEqual(srv.state);
    expect(session.getView().arrangement).toBeNull(); expect(motion.position).toEqual(visible); expect(motion.destination).toEqual(waiting);
    expect(motions.get("W03")!.destination).toEqual(placement(srv.state, "W03").position);
  });

  it("lost success retains its pose; receipt recovery never repeats the walk or POST", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    srv.mode("drop-after-commit"); expect(await session.dispatch(assignment(srv.state))).toBe(false);
    const originalId = session.getView().pending[0].commandId;
    expect(session.getView().status).toBe("unknown-outcome"); expect(session.getView().arrangement?.commandId).toBe(originalId);
    advance(50); const visible = [...motion.position], travelled = motion.travelled;
    srv.mode("normal"); await session.refresh();
    expect(session.getView().status).toBe("synced"); expect(session.getView().pending).toHaveLength(0);
    expect(motion.position).toEqual(visible); expect(motion.travelled).toBe(travelled); expect(changes).toHaveLength(1);
    expect(await session.retryPending()).toBe(false); expect(srv.posts.map(p => p.commandId)).toEqual([originalId]);
  });

  it("unknown without a receipt keeps the preview until an explicit same-ID retry", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    srv.mode("drop-before-commit"); expect(await session.dispatch(assignment(srv.state))).toBe(false);
    const originalId = session.getView().pending[0].commandId, target = [...motion.destination];
    srv.mode("normal"); await session.refresh(); advance(40);
    expect(session.getView().status).toBe("unknown-outcome"); expect(motion.destination).toEqual(target); expect(changes).toHaveLength(1);
    const visible = [...motion.position]; expect(await session.retryPending()).toBe(true);
    expect(motion.position).toEqual(visible); expect(changes).toHaveLength(1);
    expect(srv.posts.map(p => p.commandId)).toEqual([originalId, originalId]);
  });

  it("a newer receipt cannot clear a preview while state reads still lag behind", async () => {
    const srv = server(), { session, motions, changes } = await client(srv);
    const before = structuredClone(srv.state);
    srv.mode("drop-after-commit"); await session.dispatch(assignment(srv.state));
    const target = [...motions.get("W01")!.destination]; srv.lag(before);
    await session.refresh();
    expect(session.getView().pending).toHaveLength(1); expect(session.getView().status).toBe("unknown-outcome");
    expect(session.getView().state!.revision).toBe(before.revision); expect(motions.get("W01")!.destination).toEqual(target); expect(changes).toHaveLength(1);
    srv.lag(null); await session.refresh();
    expect(session.getView().pending).toHaveLength(0); expect(session.getView().status).toBe("synced"); expect(changes).toHaveLength(1);
  });

  it("replacement moves both people immediately; another action retargets from their visible positions", async () => {
    let initial = readyForRound(1); const assigned = assignment(initial); initial = step(initial, assigned);
    const srv = server(initial), { session, motions, changes, advance } = await client(srv, ["W01", "W03"]);
    const former = motions.get("W01")!, replacement = motions.get("W03")!, gate = srv.hold();
    const save = session.dispatch({ ...assigned, type: "ReplacePlayer", playerId: "W03" });
    expect(former.walking).toBe(true); expect(replacement.walking).toBe(true);
    expect(session.getView().arrangement!.playerIds.sort()).toEqual(["W01", "W03"]);
    await gate.received; advance(50); const visible = [...replacement.position], formerVisible = [...former.position];
    gate.release(); expect(await save).toBe(true); expect(changes).toHaveLength(2);
    expect(await session.dispatch({ type: "RemovePlayer", matchId: assigned.matchId, slotId: assigned.slotId })).toBe(true);
    expect(replacement.position).toEqual(visible); expect(former.position).toEqual(formerVisible);
    expect(changes.filter(c => c.playerId === "W01")).toHaveLength(1); expect(changes.filter(c => c.playerId === "W03")).toHaveLength(2);
    advance(1000); for (const [id, motion] of motions) expect(motion.position).toEqual(placement(srv.state, id).position);
  });

  it("cross-court moves preview the atomic removal and destination; cancel previews every player", async () => {
    let initial = readyForRound(1); const assigned = assignment(initial); initial = step(initial, assigned);
    const srv = server(initial), { session, motions } = await client(srv), target = assignment(srv.state, "W01", 1), gate = srv.hold();
    const save = session.dispatch({ ...target, type: "MovePlayer", fromMatchId: assigned.matchId, fromSlotId: assigned.slotId, playerId: "W01" });
    const preview = session.getView().arrangement!.state;
    expect(preview.matches.find(m => m.id === assigned.matchId)!.draftSlots.find(s => s.id === assigned.slotId)!.playerId).toBeNull();
    expect(motions.get("W01")!.destination).toEqual(placement(preview, "W01").position);
    expect(session.getView().state).toEqual(srv.state); await gate.received; gate.release(); expect(await save).toBe(true);
    const cancelGate = srv.hold(), cancel = session.dispatch({ type: "CancelDraft", matchId: target.matchId });
    expect(session.getView().arrangement!.playerIds).toEqual(["W01"]);
    expect(playerPlacement(preview, project(session.getView().arrangement!.state), "W01", layout).onCourt).toBe(false);
    await cancelGate.received; cancelGate.release(); expect(await cancel).toBe(true);
  });

  it("preserves unrelated remote updates while an uncertain local intent stays visible", async () => {
    const srv = server(), { session } = await client(srv);
    srv.mode("drop-before-commit"); await session.dispatch(assignment(srv.state));
    srv.remote(assignment(srv.state, "W02"));
    // First refresh emits fresh authority with both visual arrangements, before
    // receipt reconciliation determines that the original version has expired.
    const seen: EventState[] = []; session.subscribe(() => { const preview = session.getView().arrangement; if (preview) seen.push(preview.state); });
    await session.refresh();
    expect(seen.some(s => placement(s, "W01").onCourt && placement(s, "W02").onCourt)).toBe(true);
    expect(session.getView().status).toBe("conflict"); expect(session.getView().arrangement).toBeNull();
    expect(placement(session.getView().state!, "W02").onCourt).toBe(true);
  });

  it("storage failure corrects the preview without ever posting a command", async () => {
    const srv = server(), { session, motions, changes } = await client(srv), waiting = [...motions.get("W01")!.destination];
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("quota", "QuotaExceededError"); });
    const save = session.dispatch(assignment(srv.state)); expect(motions.get("W01")!.walking).toBe(true);
    expect(await save).toBe(false); expect(session.getView().errorCode).toBe("LOCAL_STORAGE_UNAVAILABLE");
    expect(session.getView().arrangement).toBeNull(); expect(motions.get("W01")!.destination).toEqual(waiting);
    expect(changes).toHaveLength(2); expect(srv.posts).toHaveLength(0);
  });

  it("reload reconstructs only a matching-basis pending pose, without automatic resubmission", async () => {
    const srv = server(), first = await client(srv); srv.mode("drop-before-commit");
    await first.session.dispatch(assignment(srv.state)); const original = first.session.getView().pending[0];
    first.session.dispose(); const reloaded = await client(srv);
    expect(reloaded.session.getView().pending).toEqual([original]); expect(reloaded.session.getView().arrangement?.commandId).toBe(original.commandId);
    expect(reloaded.motions.get("W01")!.destination).toEqual(placement(first.session.getView().arrangement!.state, "W01").position);
    expect(srv.posts).toHaveLength(1);
  });

  it("restore and management actions cannot be predicted or replayed", async () => {
    const srv = server(), { session, motions } = await client(srv), bench = [...motions.get("W01")!.destination];
    expect(await session.dispatch({ type: "StartMatch", matchId: project(srv.state).matches[0].id })).toBe(false);
    expect(session.getView().arrangement).toBeNull(); expect(srv.posts).toHaveLength(0);
    srv.mode("drop-before-commit"); await session.dispatch(assignment(srv.state)); srv.restore(); await session.refresh();
    expect(session.getView().arrangement).toBeNull(); expect(session.getView().status).toBe("conflict");
    expect(motions.get("W01")!.position).toEqual(bench); expect(await session.retryPending()).toBe(false); expect(srv.posts).toHaveLength(1);
  });

  it("invalid or stale-basis commands never create a visual arrangement", async () => {
    const srv = server(), { session, motions, changes } = await client(srv), waiting = [...motions.get("W01")!.destination];
    const wrong = { ...assignment(srv.state), playerId: "B01" };
    const save = session.dispatch(wrong); expect(session.getView().arrangement).toBeNull(); expect(await save).toBe(false);
    await session.refresh();
    expect(await session.dispatch(assignment(srv.state), { revision: 0, generation: 0 })).toBe(false);
    expect(session.getView().arrangement).toBeNull(); expect(motions.get("W01")!.destination).toEqual(waiting); expect(changes).toHaveLength(0);
  });
});
