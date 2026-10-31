import type { EventProjection, EventState, MatchView, TeamId } from "../competition";
import { playerPlacement, type Point, type WorldLayout } from "./world";

import type { AvatarPlacements } from "./avatar-placements";
import { RallyTimeline, type RallyBall, type StrokePose } from "./rally-motion";

import { sampleFinale, type FinalePlan } from "./finale";

type Mode = "ready" | "warmup" | "playing" | "rest";
type Actor = { id: string; side: TeamId; base: Point; facing: number; onCourt: boolean; free: boolean; matchId?: string };
export type CourtProgramme = { key: string; matchId: string; mode: Mode; white: string[]; black: string[]; sequences: string[][]; ballCount: number };
export type ActorPose = { base: Point; offset: Point; yaw: number; swing: number; stretch: number; look: number; gait: number; walking: boolean; held: boolean; action: string; stroke?: StrokePose };
export type BallPose = RallyBall & { id: string; matchId: string };
type Routine = { clock: number; duration: number; action: "rest" | "walk" | "stretch" | "paddle" | "watch"; from: Point; to: Point; origin: Point; roaming: boolean; random: () => number };
type Runtime = { actor: Actor; pose: ActorPose; routine: Routine; grace: number };
type Court = { plan: CourtProgramme; clock: number; duration: number; rallies: RallyTimeline[] };
const zero = (): Point => [0, 0, 0];
const copy = (p: Point): Point => [...p];
const mix = (a: Point, b: Point, t: number): Point => a.map((n, i) => n + (b[i] - n) * t) as Point;
const distance = (a: Point, b: Point) => Math.hypot(...a.map((n, i) => n - b[i]));
const hash = (value: string) => [...value].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function random(seed: number) { let value = seed || 1; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }
// Ground-plane segment separation for brief, reserved spectator walks.
function pathDistance(a: Point, b: Point, c: Point, d: Point) {
  const point = (p: Point, x: Point, y: Point) => {
    const dx = y[0] - x[0], dz = y[2] - x[2], length = dx * dx + dz * dz;
    const u = length ? Math.max(0, Math.min(1, ((p[0] - x[0]) * dx + (p[2] - x[2]) * dz) / length)) : 0;
    return Math.hypot(p[0] - x[0] - u * dx, p[2] - x[2] - u * dz);
  };
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(point(a, c, d), point(b, c, d), point(c, a, b), point(d, a, b));
}
function members(match: MatchView, side: TeamId) {
  return (match.phase === "PLANNING" ? match.draftSlots : match.participants).filter(p => p.sideId === side && p.playerId).map(p => p.playerId!);
}

/** Confirmed participants only. History and completed matches never replay a rally. */
export function courtProgrammes(state: EventState, view: EventProjection): CourtProgramme[] {
  return view.matches.map(match => {
    const white = members(match, "WHITE"), black = members(match, "BLACK");
    const mode: Mode = !view.isCurrent || match.phase === "COMPLETED" ? "rest" : match.phase !== "PLANNING" ? "playing" : white.length && black.length ? "warmup" : "ready";
    let sequences: string[][] = [];
    if (mode === "warmup" && white.length === 2 && black.length === 2) sequences = white.map((id, i) => [id, black[i]]);
    else if ((mode === "warmup" || mode === "playing") && white.length && black.length) {
      const count = Math.max(white.length, black.length);
      sequences = [Array.from({ length: count }, (_, i) => [white[i % white.length], black[i % black.length]]).flat()];
    }
    return { key: `${state.id}:${state.generation}:${view.round.id}:${match.id}:${match.phase}:${white.join()}:${black.join()}:${view.isCurrent}`,
      matchId: match.id, mode, white, black, sequences, ballCount: sequences.length };
  });
}

/** Browser-local choreography. Its clock, poses and random seed never leave this Module. */
export class LocalChoreography {
  private actors = new Map<string, Runtime>();
  private courts: Court[] = [];
  finale: FinalePlan | undefined;
  finaleClock = 0;
  private arrivals = new Map<string, boolean>();
  private locked = new Set<string>();
  private pressed: string | null = null;
  private context = "";
  private walkEdge = 10.5;
  private ballsValue: BallPose[] = [];
  active = false;
  reduced = false;
  constructor(private seed = Math.floor(Math.random() * 0xffffffff)) {}
  get enabled() { return this.active && !this.reduced; }
  get balls(): readonly BallPose[] { return this.ballsValue; }
  get programmes(): readonly CourtProgramme[] { return this.courts.map(c => c.plan); }
  pose(playerId: string): ActorPose | undefined { return this.actors.get(playerId)?.pose; }
  arrived(playerId: string, ready: boolean) { this.arrivals.set(playerId, ready); }
  configure(active: boolean, reduced: boolean) {
    this.active = active; this.reduced = reduced;
    if (!this.enabled) this.ballsValue = [];
    if (reduced) for (const runtime of this.actors.values()) {
      runtime.pose.offset = zero(); runtime.pose.yaw = runtime.actor.facing;
      runtime.routine.from = zero(); runtime.routine.to = zero(); runtime.routine.origin = zero(); runtime.routine.clock = 0; runtime.routine.roaming = false; runtime.routine.action = "rest";
      runtime.pose.stroke = undefined; runtime.pose.swing = runtime.pose.stretch = runtime.pose.look = runtime.pose.gait = 0; runtime.pose.walking = false;
    }
  }
  interact(change: { pressed?: string | null; locked?: string[] }) {
    if (change.pressed !== undefined && change.pressed !== this.pressed) {
      const former = this.pressed && this.actors.get(this.pressed);
      if (former) former.grace = 0.35; // Keep the same target through the native click after pointerup.
      this.pressed = change.pressed;
    }
    if (change.locked) this.locked = new Set(change.locked);
  }
  sync(state: EventState, view: EventProjection, layout: WorldLayout, positions?: AvatarPlacements, finale?: FinalePlan) {
    const context = finale?.key ?? `${state.id}:${state.generation}:${view.round.id}`;
    const reset = context !== this.context; this.context = context; this.finale=finale; if(reset) this.finaleClock=0;
    this.walkEdge = Math.min(10.5, layout.width / 2 - 1.5);
    const plans = finale ? [] : courtProgrammes(state, view), previous = this.actors;
    this.actors = new Map(state.players.map(player => {
      const canonical = finale?.placements[player.id] ?? playerPlacement(state, view, player.id, layout), local = positions?.get(player.id);
      const placement = !canonical.onCourt && local && !local.onCourt ? local : canonical;
      const match = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants).some(p => p.playerId === player.id));
      const actor: Actor = { id: player.id, side: placement.sideId ?? (player.teamId === "BLACK" ? "BLACK" : "WHITE"), base: placement.position, facing: placement.facing, onCourt: placement.onCourt, free: player.teamId === "FREE", matchId: match?.id };
      const old = !reset && previous.get(player.id);
      if (old && old.actor.onCourt === actor.onCourt && old.actor.matchId === actor.matchId && distance(old.actor.base, actor.base) < .001) { old.actor = actor; old.pose.base = actor.base; return [player.id, old]; }
      const rng = random(this.seed ^ hash(player.id + context));
      const pose: ActorPose = { base: actor.base, offset: zero(), yaw: actor.facing, swing: 0, stretch: 0, look: 0, gait: 0, walking: false, held: false, action: "rest" };
      return [player.id, { actor, pose, grace: 0, routine: { clock: rng() * 1.4, duration: 1.5 + rng() * 1.5, action: "rest", from: zero(), to: zero(), origin: zero(), roaming: false, random: rng } }];
    }));
    const previousCourts = this.courts;
    this.courts = plans.map(plan => {
      const variation = (hash(plan.key) ^ this.seed) >>> 0;
      const duration = plan.mode === "playing" ? .72 + (variation % 9) / 100 : 1.28 + (variation % 13) / 100;
      const actors = [...this.actors.values()].map(({ actor }) => ({ id: actor.id, base: actor.base, free: actor.free }));
      return previousCourts.find(c => c.plan.key === plan.key) ?? { plan, clock: 0, duration,
        rallies: plan.sequences.map((sequence, lane) => new RallyTimeline(sequence, actors, duration, lane * .43, plan.mode === "playing", variation ^ Math.imul(lane + 1, 0x9e3779b1))) };
    });
    const validBalls = new Set(plans.flatMap(plan => plan.sequences.map((_, lane) => `${plan.key}:${lane}`)));
    this.ballsValue = this.ballsValue.filter(ball => validBalls.has(ball.id));
    if (reset) { this.arrivals.clear(); this.pressed = null; this.locked.clear(); }
    for (const id of this.arrivals.keys()) if (!this.actors.has(id)) this.arrivals.delete(id);
  }
  replayFinale() { if (this.finale) { this.finaleClock = 0; this.ballsValue = []; } }
  step(delta: number): boolean {
    if (!this.enabled) return false;
    const dt = Math.min(.05, Math.max(0, delta));
    const previousBalls = this.ballsValue, roaming = this.courts.some(c => c.plan.mode === "playing"); this.ballsValue = [];
    for (const runtime of this.actors.values()) {
      runtime.grace = Math.max(0, runtime.grace - dt);
      runtime.pose.held = runtime.actor.id === this.pressed || this.locked.has(runtime.actor.id) || runtime.grace > 0;
      if (runtime.actor.onCourt) continue;
      if (this.arrivals.get(runtime.actor.id) === false) { runtime.pose.offset = zero(); runtime.pose.walking = false; continue; }
      if (!runtime.pose.held) this.bench(runtime, dt, roaming);
    }
    if (this.finale) {
      if (![...this.actors.keys()].some(id => this.arrivals.get(id) === false)) {
        this.finaleClock += dt; const frame=sampleFinale(this.finale,this.finaleClock);
        for(const [id,pose] of frame.poses) if(!this.actors.get(id)?.pose.held) Object.assign(this.actors.get(id)!.pose,pose);
        this.ballsValue=frame.balls;
      }
      return true;
    }
    for (const court of this.courts) {
      const ids = [...court.plan.white, ...court.plan.black];
      if (ids.some(id => this.arrivals.get(id) === false)) continue;
      if (ids.some(id => this.actors.get(id)?.pose.held)) { this.ballsValue.push(...previousBalls.filter(ball => ball.matchId === court.plan.matchId)); continue; }
      court.clock += dt;
      const live = court.plan.mode === "playing", ready = court.plan.mode === "ready";
      for (const id of ids) {
        const runtime = this.actors.get(id)!; const p = runtime.pose, phase = court.clock + (hash(id) % 31) / 7;
        p.stroke = undefined; p.action = court.plan.mode; p.held = false; p.walking = false;
        p.offset = [Math.sin(phase * (live ? 1.9 : .9)) * (live ? .38 : ready ? .065 : .13), 0, Math.sin(phase * 1.3) * (live ? .24 : ready ? .045 : .08)];
        p.yaw = runtime.actor.facing; p.swing = ready ? Math.sin(phase * 2) * .16 : 0;
        p.stretch = 0; p.look = Math.sin(phase * .9) * .15; p.gait = live ? Math.sin(phase * 8) * .24 : Math.sin(phase * 2) * .035;
      }
      for (let lane = 0; lane < court.rallies.length; lane++) {
        const sample = court.rallies[lane].sample(court.clock);
        for (const [id, pose] of sample.poses) Object.assign(this.actors.get(id)!.pose, pose);
        this.ballsValue.push({ id: `${court.plan.key}:${lane}`, matchId: court.plan.matchId, ...sample.ball });
      }
    }
    return this.actors.size > 0;
  }
  private destination(runtime: Runtime): Point | null {
    const { actor, pose, routine: r } = runtime, from = actor.base.map((n, i) => n + pose.offset[i]) as Point;
    const side = Math.sign(actor.base[2]);
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = r.random() * Math.PI * 2, radius = 1.6 + r.random() * 3.0;
      const to: Point = [Math.max(-this.walkEdge, Math.min(this.walkEdge, from[0] + Math.cos(angle) * radius)), from[1], side * Math.max(7.6, Math.min(10.2, Math.abs(from[2]) + Math.sin(angle) * radius))];
      if (distance(from, to) < 1.35) continue;
      const clear = [...this.actors.values()].every(other => {
        if (other === runtime || other.actor.onCourt) return true;
        const at = other.actor.base.map((n, i) => n + other.pose.offset[i]) as Point;
        const end = !other.pose.held && other.pose.walking ? other.actor.base.map((n, i) => n + other.routine.to[i]) as Point : at;
        return distance(to, at) > 2.5 && distance(to, end) > 2.5 && pathDistance(from, to, at, end) > 1.9;
      });
      if (clear) return to.map((n, i) => n - actor.base[i]) as Point;
    }
    return null;
  }
  private bench(runtime: Runtime, dt: number, roaming: boolean) {
    const r = runtime.routine, p = runtime.pose;
    if (r.roaming !== roaming) {
      r.roaming = roaming; r.clock = 0; r.duration = .4 + r.random() * 1.4;
      r.from = r.to = copy(p.offset); r.origin = copy(p.offset); r.action = "rest";
    }
    r.clock += dt;
    if (r.clock >= r.duration) {
      r.clock = 0; r.from = copy(p.offset);
      const choice = roaming && r.random() < .55 ? 0 : Math.floor(r.random() * 5);
      r.action = (["walk", "stretch", "paddle", "watch", "rest"] as const)[choice];
      const destination = r.action === "walk" && roaming ? this.destination(runtime) : null;
      if (r.action === "walk" && roaming && !destination) r.action = "watch";
      r.to = r.action !== "walk" ? copy(p.offset) : roaming ? destination! : [r.origin[0] + (r.random() - .5) * .52, 0, r.origin[2] + (r.random() - .5) * .8];
      r.duration = r.action === "walk" ? Math.max(1.8, distance(r.from, r.to) / (roaming ? .52 + r.random() * .22 : .23)) : 1.8 + r.random() * 3;
    }
    const u = Math.min(1, r.clock / r.duration), ease = u * u * (3 - 2 * u), pulse = Math.sin(Math.PI * u);
    p.offset = mix(r.from, r.to, ease); p.action = r.action; p.walking = r.action === "walk";
    const direction = Math.atan2(r.to[0] - r.from[0], r.to[2] - r.from[2]);
    const turn = Math.atan2(Math.sin(direction - runtime.actor.facing), Math.cos(direction - runtime.actor.facing));
    p.yaw = runtime.actor.facing + (r.action === "walk" ? pulse * (roaming ? turn : .5 * Math.sign(r.to[0] - r.from[0])) : 0);
    p.swing = r.action === "paddle" ? Math.sin(u * Math.PI * 5) * pulse * .35 : 0;
    p.stretch = r.action === "stretch" ? pulse : 0; p.look = r.action === "watch" ? Math.sin(u * Math.PI * 2) * .65 : Math.sin(u * Math.PI) * .08;
    p.gait = r.action === "walk" ? Math.sin(r.clock * 8) * .32 * pulse : 0;
  }
}
