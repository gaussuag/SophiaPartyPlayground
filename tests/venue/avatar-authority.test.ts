import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { connect, type EventSession } from "../../src/modules/session";
import { decide, project, type CompetitionCommand, type EventState } from "../../src/modules/competition";
import type { CommandEnvelope } from "../../src/modules/records/protocol";
import { AvatarMotion } from "../../src/modules/venue/avatar-motion";
import { courtCenter, slotPosition, worldLayout, type Point } from "../../src/modules/venue/world";
import { readyForRound, step } from "../fixtures/event";

const sessions: EventSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.dispose()));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Same public transport seam as tests/session: real decisions, real session,
// fake IndexedDB, and deterministic response loss. No scene or session mocking.
function server(initial = readyForRound(1)) {
  let state = { ...initial, id: `avatar-authority-${crypto.randomUUID()}` };
  let mode: "normal" | "reject" | "drop-before-commit" | "drop-after-commit" = "normal";
  let held: { arrived: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | null = null;
  const posts: CommandEnvelope[] = [], receipts = new Map<string, { status: string; appliedRevision: number }>();
  const fetcher = (async (input, init) => {
    const url = String(input);
    if (url.includes("/receipts/")) return Response.json({ receipt: receipts.get(url.split("/").at(-1)!) ?? null });
    if (init?.method !== "POST") return Response.json({ state: structuredClone(state), role: "operator" });
    const envelope = JSON.parse(init.body as string) as CommandEnvelope;
    posts.push(envelope);
    if (held) { const gate = held; gate.arrived.resolve(); await gate.released.promise; held = null; }
    if (mode === "reject") return Response.json({ error: { code: "WRITE_REJECTED", message: "保存被拒绝" } }, { status: 422 });
    if (mode === "drop-before-commit") throw new TypeError("request did not arrive");
    if (envelope.expectedRevision !== state.revision || envelope.expectedGeneration !== state.generation) return Response.json({ error: { code: "REVISION_CONFLICT", message: "其他设备已更新" } }, { status: 409 });
    const decision = decide(state, envelope.command, { actorId: "operator", commandId: envelope.commandId, now: state.updatedAt });
    if (!decision.ok) return Response.json({ error: decision.error }, { status: 422 });
    state = decision.state;
    receipts.set(envelope.commandId, { status: "APPLIED", appliedRevision: state.revision });
    if (mode === "drop-after-commit") throw new TypeError("successful response lost");
    return Response.json({ state: structuredClone(state), role: "operator" });
  }) as typeof fetch;
  return {
    get state() { return state; }, posts, fetcher,
    mode(next: typeof mode) { mode = next; },
    remote(command: CompetitionCommand) { state = step(state, command); },
    hold() { const gate = { arrived: deferred(), released: deferred() }; held = gate; return { received: gate.arrived.promise, release: gate.released.resolve }; },
  };
}

const layout = worldLayout(390, 844);
// Minimal Scene adapter for these planning fixtures. All inputs come from the
// session's confirmed state; neither commands nor pending envelopes set targets.
function placement(state: EventState, playerId: string) {
  const player = state.players.find(p => p.id === playerId)!;
  const view = project(state);
  const match = view.matches.find(m => m.draftSlots.some(s => s.playerId === playerId));
  if (match) {
    const center = courtCenter(state.courts.find(c => c.id === match.courtId)!.number, layout);
    const point = slotPosition(match.draftSlots.find(s => s.playerId === playerId)!, match.draftSlots);
    return { point: center.map((n, i) => n + point[i]) as Point, facing: player.teamId === "WHITE" ? Math.PI : 0 };
  }
  const teamIndex = state.players.filter(p => p.teamId === player.teamId).findIndex(p => p.id === playerId);
  return { point: [player.teamId === "WHITE" ? -5.4 : 5.4, 0.07, (teamIndex - 3) * layout.courtSpacing / 3] as Point, facing: player.teamId === "WHITE" ? Math.PI / 2 : -Math.PI / 2 };
}

async function client(srv: ReturnType<typeof server>, ids = ["W01"]) {
  const session = connect(srv.state.id, { fetch: srv.fetcher, intervalMs: 100000, timeoutMs: 2000 });
  sessions.push(session); await session.ready;
  const context = (state: EventState) => `${state.id}:${state.generation}:${state.activeRoundId}`;
  const initial = session.getView().state!;
  const motions = new Map(ids.map(id => { const { point, facing } = placement(initial, id); return [id, new AvatarMotion(point, facing, context(initial))]; }));
  const changes: { playerId: string; revision: number; status: string }[] = [];
  session.subscribe(() => {
    const view = session.getView(); if (!view.state) return;
    for (const [id, motion] of motions) {
      const { point, facing } = placement(view.state, id);
      if (motion.destination.some((n, i) => n !== point[i])) changes.push({ playerId: id, revision: view.state.revision, status: view.status });
      motion.retarget(point, facing, layout, context(view.state));
    }
  });
  return { session, motions, changes, advance(frames: number) { for (let i = 0; i < frames; i++) motions.forEach(m => m.step(1 / 60)); } };
}

function assignment(state: EventState, playerId = "W01"): CompetitionCommand & { matchId: string; slotId: string } {
  const match = project(state).matches[0], player = state.players.find(p => p.id === playerId)!;
  const slot = match.draftSlots.find(s => s.sideId === player.teamId && (!s.gender || s.gender === player.gender))!;
  return { type: "AssignPlayer", matchId: match.id, slotId: slot.id, playerId };
}

describe("session authority drives formal avatar targets", () => {
  it("a held save preserves the waiting position; only its accepted snapshot starts one walk", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    const waiting = motion.destination, gate = srv.hold();
    const save = session.dispatch(assignment(srv.state)); await gate.received;
    expect(session.getView().status).toBe("saving"); expect(session.getView().pending).toHaveLength(1);
    expect(motion.destination).toEqual(waiting); expect(motion.moving).toBe(false); expect(changes).toHaveLength(0);
    gate.release(); expect(await save).toBe(true);
    const target = placement(srv.state, "W01").point;
    expect(motion.position).toEqual(waiting); expect(motion.destination).toEqual(target); expect(motion.walking).toBe(true);
    expect(changes).toEqual([{ playerId: "W01", revision: srv.state.revision, status: "saving" }]);
    advance(30); const visible = [...motion.position], walked = motion.travelled;
    await session.refresh();
    expect(motion.position).toEqual(visible); expect(motion.travelled).toBe(walked); expect(changes).toHaveLength(1);
    advance(600); expect(motion.position).toEqual(target); expect(motion.moving).toBe(false); expect(srv.posts).toHaveLength(1);
  });

  it("a rejected save leaves the formal target and pose unchanged and exposes the error", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    const waiting = motion.destination, revision = session.getView().state!.revision;
    srv.mode("reject"); expect(await session.dispatch(assignment(srv.state))).toBe(false);
    expect(session.getView().errorCode).toBe("WRITE_REJECTED"); expect(session.getView().pending).toHaveLength(0);
    expect(session.getView().state!.revision).toBe(revision);
    advance(600); expect(motion.destination).toEqual(waiting); expect(motion.position).toEqual(waiting); expect(changes).toHaveLength(0);
  });

  it("a revision conflict refreshes authority without displaying the rejected player's proposed target", async () => {
    const srv = server(), { session, motions, changes } = await client(srv), motion = motions.get("W01")!;
    const waiting = motion.destination, rejected = assignment(srv.state);
    srv.remote(assignment(srv.state, "W03"));
    expect(await session.dispatch(rejected)).toBe(false);
    expect(session.getView().status).toBe("conflict"); expect(session.getView().state!.revision).toBe(srv.state.revision);
    expect(motion.destination).toEqual(waiting); expect(motion.moving).toBe(false); expect(changes).toHaveLength(0);
    expect(srv.posts).toHaveLength(1);
  });

  it("lost success remains visually uncommitted until a confirmed read; receipt recovery never repeats the walk or POST", async () => {
    const srv = server(), { session, motions, changes, advance } = await client(srv), motion = motions.get("W01")!;
    const waiting = motion.destination;
    srv.mode("drop-after-commit"); expect(await session.dispatch(assignment(srv.state))).toBe(false);
    const originalId = session.getView().pending[0].commandId;
    expect(session.getView().status).toBe("unknown-outcome"); expect(placement(srv.state, "W01").point).not.toEqual(waiting);
    advance(120); expect(motion.destination).toEqual(waiting); expect(motion.position).toEqual(waiting); expect(changes).toHaveLength(0);
    srv.mode("normal"); await session.refresh();
    expect(session.getView().status).toBe("synced"); expect(session.getView().pending).toHaveLength(0);
    expect(motion.walking).toBe(true); expect(changes).toHaveLength(1);
    advance(30); const visible = [...motion.position], walked = motion.travelled;
    await session.refresh(); expect(await session.retryPending()).toBe(false);
    expect(motion.position).toEqual(visible); expect(motion.travelled).toBe(walked); expect(changes).toHaveLength(1);
    expect(srv.posts.map(p => p.commandId)).toEqual([originalId]);
    advance(600); expect(motion.position).toEqual(placement(srv.state, "W01").point); expect(motion.moving).toBe(false);
  });

  it("unknown without a receipt stays at the bench until an explicit original-ID retry is confirmed", async () => {
    const srv = server(), { session, motions, changes } = await client(srv), motion = motions.get("W01")!;
    const waiting = motion.destination;
    srv.mode("drop-before-commit"); expect(await session.dispatch(assignment(srv.state))).toBe(false);
    const originalId = session.getView().pending[0].commandId;
    srv.mode("normal"); await session.refresh();
    expect(session.getView().status).toBe("unknown-outcome"); expect(motion.destination).toEqual(waiting); expect(changes).toHaveLength(0);
    expect(srv.posts).toHaveLength(1); expect(await session.retryPending()).toBe(true);
    expect(motion.walking).toBe(true); expect(changes).toHaveLength(1);
    expect(srv.posts.map(p => p.commandId)).toEqual([originalId, originalId]);
  });

  it("a confirmed replacement moves both people; a second confirmed command retargets the moving person from their visible position", async () => {
    let initial = readyForRound(1); const assigned = assignment(initial);
    initial = step(initial, assigned);
    const srv = server(initial), { session, motions, changes, advance } = await client(srv, ["W01", "W03"]);
    const former = motions.get("W01")!, replacement = motions.get("W03")!;
    expect(await session.dispatch({ ...assigned, type: "ReplacePlayer", playerId: "W03" })).toBe(true);
    expect(former.walking).toBe(true); expect(replacement.walking).toBe(true); expect(changes).toHaveLength(2);
    advance(50); const visible = [...replacement.position], formerVisible = [...former.position];
    expect(visible).not.toEqual(replacement.destination);
    expect(await session.dispatch({ type: "RemovePlayer", matchId: assigned.matchId, slotId: assigned.slotId })).toBe(true);
    expect(replacement.position).toEqual(visible); expect(former.position).toEqual(formerVisible);
    expect(changes.filter(c => c.playerId === "W01")).toHaveLength(1); expect(changes.filter(c => c.playerId === "W03")).toHaveLength(2);
    advance(1000);
    for (const [id, motion] of motions) { expect(motion.position).toEqual(placement(srv.state, id).point); expect(motion.moving).toBe(false); }
    expect(srv.posts).toHaveLength(2);
  });
});
