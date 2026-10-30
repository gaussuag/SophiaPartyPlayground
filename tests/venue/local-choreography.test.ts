import { describe, expect, it } from "vitest";
import { project, type EventState } from "../../src/modules/competition";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { playerPlacement, worldLayout } from "../../src/modules/venue/world";
import { arrange, completeRound, readyForRound, step } from "../fixtures/event";

const layout = worldLayout(390, 844);
function planning(white: number, black: number) {
  let state = readyForRound(1); const id = state.matches[0].id;
  state = arrange(state, id);
  for (const side of ["WHITE", "BLACK"] as const) {
    for (const slot of state.matches[0].draftSlots.filter(s => s.sideId === side).slice(side === "WHITE" ? white : black))
      state = step(state, { type: "RemovePlayer", matchId: id, slotId: slot.id });
  }
  return state;
}
function local(state: EventState, seed = 7, roundId?: string) {
  const activity = new LocalChoreography(seed);
  activity.sync(state, project(state, { roundId }), layout); activity.configure(true, false);
  return activity;
}
function run(activity: LocalChoreography, seconds: number) { for (let i = 0; i < seconds * 60; i++) activity.step(1 / 60); }
const pose = (activity: LocalChoreography, id: string) => structuredClone(activity.pose(id)!);

describe("local choreography from actual roster and phase", () => {
  for (const [white, black, balls] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [2, 0, 0], [0, 2, 0], [1, 1, 1], [1, 2, 1], [2, 1, 1], [2, 2, 2]]) {
    it(`preparation ${white}v${black} has ${balls} balls and only the selected players`, () => {
      const state = planning(white, black), unchanged = JSON.stringify(state), activity = local(state);
      const programme = activity.programmes[0]; run(activity, 1);
      expect(programme.white).toHaveLength(white); expect(programme.black).toHaveLength(black);
      expect(programme.mode).toBe(white && black ? "warmup" : "ready");
      expect(activity.balls).toHaveLength(balls);
      expect(new Set(programme.sequences.flat())).toEqual(new Set(balls ? [...programme.white, ...programme.black] : []));
      expect(JSON.stringify(state)).toBe(unchanged);
      const swings = new Set<string>();
      for (let i = 0; i < 720; i++) { activity.step(1 / 60); for (const id of [...programme.white, ...programme.black]) if (activity.pose(id)!.swing > .45) swings.add(id); }
      if (balls) expect(swings).toEqual(new Set([...programme.white, ...programme.black]));
      else for (const id of [...programme.white, ...programme.black]) expect(activity.pose(id)!.action).toBe("ready");
    });
  }

  it("two warmup balls become one faster doubles ball, with all four receiving and moving", () => {
    let state = planning(2, 2); const activity = local(state); run(activity, 1);
    const oldIds = activity.balls.map(b => b.id); expect(oldIds).toHaveLength(2);
    state = step(state, { type: "StartMatch", matchId: state.matches[0].id });
    activity.sync(state, project(state), layout); expect(activity.balls).toHaveLength(0);
    const participants = project(state).matches[0].participants.map(p => p.playerId), swings = new Set<string>(), positions = new Set<string>();
    let previousX = 0, netCrossings = 0;
    for (let i = 0; i < 600; i++) {
      activity.step(1 / 60); expect(activity.balls).toHaveLength(1);
      const ball = activity.balls[0]; expect(oldIds).not.toContain(ball.id);
      if (previousX * ball.position[2] < 0) { expect(ball.position[1]).toBeGreaterThan(.9); netCrossings++; } previousX = ball.position[2];
      for (const id of participants) { const p = activity.pose(id)!; if (p.swing > .5) swings.add(id); positions.add(`${id}:${p.offset.map(n => n.toFixed(2))}`); }
    }
    expect(swings).toEqual(new Set(participants)); expect(positions.size).toBeGreaterThan(40); expect(netCrossings).toBeGreaterThan(10);
  });

  it("actual singles use two participants and one ball; legacy awaiting-score still represents playing", () => {
    let state = readyForRound(3); const single = state.matches.find(m => m.roundId === state.activeRoundId && m.draftSlots.length === 2)!;
    expect(single).toBeDefined(); state = arrange(state, single.id); state = step(state, { type: "StartMatch", matchId: single.id });
    const activity = local(state); run(activity, 1);
    expect(activity.programmes.find(p => p.matchId === single.id)).toMatchObject({ mode: "playing", ballCount: 1 });
    expect(new Set(activity.programmes.find(p => p.matchId === single.id)!.sequences.flat()).size).toBe(2);
    const legacy = structuredClone(state); legacy.matches.find(m => m.id === single.id)!.phase = "AWAITING_RESULT";
    activity.sync(legacy, project(legacy), layout); run(activity, 1);
    expect(activity.balls).toHaveLength(1);
  });

  it("removal, replacement and pending transfer immediately retire old balls and off-court routines", () => {
    let state = planning(2, 2); const activity = local(state); run(activity, 5);
    const removed = state.matches[0].draftSlots[0];
    state = step(state, { type: "RemovePlayer", matchId: state.matches[0].id, slotId: removed.id });
    activity.sync(state, project(state), layout); expect(activity.balls).toHaveLength(0); run(activity, 1);
    expect(activity.balls).toHaveLength(1); expect(activity.programmes[0].sequences.flat()).not.toContain(removed.playerId);
    expect(activity.pose(removed.playerId!)!.base).toEqual(playerPlacement(state, project(state), removed.playerId!, layout).position);
    expect(activity.pose(removed.playerId!)!.action).not.toBe("warmup");
    state = arrange(state, state.matches[0].id); activity.sync(state, project(state), layout);
    const affected = project(state).matches[0].draftSlots.find(s => s.playerId)!.playerId!;
    activity.arrived(affected, false); run(activity, 1); expect(activity.balls).toHaveLength(0);
    activity.arrived(affected, true); run(activity, 1); expect(activity.balls).toHaveLength(2);
    expect(new Set(activity.balls.map(b => b.id)).size).toBe(2);
  });

  it("scoring keeps the real four on court without balls; new round benches them and history restores the saved matchup", () => {
    let state = planning(2, 2); const firstRound = state.activeRoundId!, participants = state.matches[0].draftSlots.map(s => s.playerId!);
    state = completeRound(state); const activity = local(state); run(activity, 2);
    expect(activity.balls).toHaveLength(0);
    for (const id of participants) expect(playerPlacement(state, project(state), id, layout).onCourt).toBe(true);
    state = step(state, { type: "AdvanceRound", roundId: firstRound }); activity.sync(state, project(state), layout); run(activity, 2);
    expect(activity.balls).toHaveLength(0);
    for (const p of state.players) expect(playerPlacement(state, project(state), p.id, layout).onCourt).toBe(false);
    activity.sync(state, project(state, { roundId: firstRound }), layout); run(activity, 2);
    expect(activity.programmes.every(p => p.mode === "rest")).toBe(true); expect(activity.balls).toHaveLength(0);
    for (const id of participants) expect(playerPlacement(state, project(state, { roundId: firstRound }), id, layout).onCourt).toBe(true);
  });

  it("atomic court moves and a replacement rebuild only affected pairings, never duplicate an actor", () => {
    let state = planning(2, 2); const activity = local(state); run(activity, 1);
    const source = state.matches[0], target = state.matches[1], moving = source.draftSlots.find(s => s.id === "WHITE-1")!.playerId!;
    state = step(state, { type: "MovePlayer", fromMatchId: source.id, fromSlotId: "WHITE-1", matchId: target.id, slotId: "WHITE-1", playerId: moving });
    activity.sync(state, project(state), layout); run(activity, 1);
    expect(activity.programmes[0].white).not.toContain(moving); expect(activity.programmes[1].white).toEqual([moving]); expect(activity.balls).toHaveLength(1);
    const oldId = state.matches[0].draftSlots.find(s => s.id === "BLACK-1")!.playerId!;
    const replacement = state.players.find(p => p.teamId === "BLACK" && p.gender === "MALE" && !activity.programmes.flatMap(c => [...c.white, ...c.black]).includes(p.id))!;
    state = step(state, { type: "ReplacePlayer", matchId: source.id, slotId: "BLACK-1", playerId: replacement.id });
    activity.sync(state, project(state), layout); expect(activity.balls).toHaveLength(0); run(activity, 1);
    expect(activity.programmes[0].black).not.toContain(oldId); expect(activity.programmes[0].black).toContain(replacement.id);
    const roster = activity.programmes.flatMap(c => [...c.white, ...c.black]); expect(new Set(roster).size).toBe(roster.length);
    expect(activity.pose(oldId)!.action).not.toBe("warmup"); expect(activity.pose(replacement.id)!.action).toBe("warmup");
  });

  it("unrelated confirmed updates do not restart a rally; restoring a generation creates fresh local programmes", () => {
    const state = planning(2, 2), activity = local(state); run(activity, .8);
    const control = local(state); run(control, .8);
    activity.sync({ ...state, revision: state.revision + 1 }, project(state), layout);
    activity.step(1 / 60); control.step(1 / 60); expect(activity.balls).toEqual(control.balls);
    const restored = { ...state, generation: state.generation + 1 };
    activity.sync(restored, project(restored), layout); expect(activity.balls).toHaveLength(0);
    run(activity, .1); expect(activity.balls.map(b => b.id)).not.toEqual(control.balls.map(b => b.id));
  });

  it("independent browsers vary in rhythm while preserving identical rosters, phase and scores", () => {
    const state = planning(2, 2), original = JSON.stringify(state), a = local(state, 17), b = local(state, 991);
    run(a, 5); run(b, 5);
    expect(a.programmes).toEqual(b.programmes); expect(a.balls).not.toEqual(b.balls);
    expect(JSON.stringify(state)).toBe(original);
  });
});

describe("bench routines and local lifecycle", () => {
  it("varied independent routines stay in each bench corridor without changing the roster", () => {
    const state = planning(0, 0), original = JSON.stringify(state), activity = local(state), actions = new Set<string>(), positions = new Set<string>();
    let maxX = 0, maxZ = 0, minBenchZ = Infinity;
    for (let i = 0; i < 3600; i++) {
      activity.step(1 / 60);
      for (const player of state.players) {
        const p = activity.pose(player.id)!; actions.add(p.action); positions.add(`${player.id}:${p.offset.join()}`);
        maxX = Math.max(maxX, Math.abs(p.offset[0])); maxZ = Math.max(maxZ, Math.abs(p.offset[2])); minBenchZ = Math.min(minBenchZ, Math.abs(p.base[2] + p.offset[2]));
      }
    }
    expect(actions).toEqual(new Set(["rest", "walk", "stretch", "paddle", "watch"]));
    expect(maxX).toBeLessThanOrEqual(.26); expect(maxZ).toBeLessThanOrEqual(.4); expect(minBenchZ).toBeGreaterThan(7.9);
    expect(positions.size).toBeGreaterThan(100); expect(JSON.stringify(state)).toBe(original);
  });

  it("pointerdown, native click grace and selected candidates freeze the target without freezing other players", () => {
    const state = planning(0, 0), activity = local(state); run(activity, 9);
    const id = state.players.find(p => activity.pose(p.id)!.walking)!.id, held = pose(activity, id);
    activity.interact({ pressed: id }); run(activity, 1);
    expect(activity.pose(id)).toEqual({ ...held, held: true });
    activity.interact({ pressed: null }); run(activity, .2); expect(activity.pose(id)!.offset).toEqual(held.offset);
    activity.interact({ locked: [id] }); run(activity, 3); expect(activity.pose(id)!.offset).toEqual(held.offset);
    activity.interact({ locked: [] }); run(activity, 5); expect(activity.pose(id)!.offset).not.toEqual(held.offset);
  });

  it("pause/background/view departure and reduced motion stop local time; repeated resume does not duplicate balls", () => {
    const state = planning(2, 2), activity = local(state); run(activity, 1);
    const id = state.players[0].id, before = pose(activity, id);
    activity.configure(false, false); expect(activity.balls).toHaveLength(0); expect(activity.step(1)).toBe(false); expect(activity.pose(id)).toEqual(before);
    for (let i = 0; i < 10; i++) { activity.configure(true, false); run(activity, .1); expect(activity.balls).toHaveLength(2); activity.configure(false, false); }
    activity.configure(true, true); run(activity, 3); expect(activity.balls).toHaveLength(0);
    for (const player of state.players) expect(activity.pose(player.id)).toMatchObject({ offset: [0, 0, 0], swing: 0, stretch: 0, gait: 0 });
    activity.configure(true, false); run(activity, 1); expect(activity.balls).toHaveLength(2);
  });
});
