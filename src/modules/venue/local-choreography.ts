import type { EventProjection, EventState, MatchView, TeamId } from "../competition";
import { playerPlacement, type Point, type WorldLayout } from "./world";

type Mode = "ready" | "warmup" | "playing" | "rest";
type Actor = { id: string; side: TeamId; base: Point; facing: number; onCourt: boolean; matchId?: string };
export type CourtProgramme = { key: string; matchId: string; mode: Mode; white: string[]; black: string[]; sequences: string[][]; ballCount: number };
export type ActorPose = { base: Point; offset: Point; yaw: number; swing: number; stretch: number; look: number; gait: number; walking: boolean; held: boolean; action: string };
export type BallPose = { id: string; matchId: string; position: Point; bounce: number };
type Routine = { clock: number; duration: number; action: "rest" | "walk" | "stretch" | "paddle" | "watch"; from: Point; to: Point; random: () => number };
type Runtime = { actor: Actor; pose: ActorPose; routine: Routine; grace: number };
type Court = { plan: CourtProgramme; clock: number; duration: number };
const zero = (): Point => [0, 0, 0];
const copy = (p: Point): Point => [...p];
const mix = (a: Point, b: Point, t: number): Point => a.map((n, i) => n + (b[i] - n) * t) as Point;
const distance = (a: Point, b: Point) => Math.hypot(...a.map((n, i) => n - b[i]));
const hash = (value: string) => [...value].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function random(seed: number) { let value = seed || 1; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }
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
  private arrivals = new Map<string, boolean>();
  private locked = new Set<string>();
  private pressed: string | null = null;
  private context = "";
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
      runtime.pose.swing = runtime.pose.stretch = runtime.pose.look = runtime.pose.gait = 0; runtime.pose.walking = false;
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
  sync(state: EventState, view: EventProjection, layout: WorldLayout) {
    const context = `${state.id}:${state.generation}:${view.round.id}`;
    const reset = context !== this.context; this.context = context;
    const plans = courtProgrammes(state, view), previous = this.actors;
    this.actors = new Map(state.players.map(player => {
      const placement = playerPlacement(state, view, player.id, layout);
      const match = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants).some(p => p.playerId === player.id));
      const actor: Actor = { id: player.id, side: player.teamId, base: placement.position, facing: placement.facing, onCourt: placement.onCourt, matchId: match?.id };
      const old = !reset && previous.get(player.id);
      if (old && old.actor.onCourt === actor.onCourt && old.actor.matchId === actor.matchId && distance(old.actor.base, actor.base) < .001) { old.actor = actor; old.pose.base = actor.base; return [player.id, old]; }
      const rng = random(this.seed ^ hash(player.id + context));
      const pose: ActorPose = { base: actor.base, offset: zero(), yaw: actor.facing, swing: 0, stretch: 0, look: 0, gait: 0, walking: false, held: false, action: "rest" };
      return [player.id, { actor, pose, grace: 0, routine: { clock: rng() * 1.4, duration: 1.5 + rng() * 1.5, action: "rest", from: zero(), to: zero(), random: rng } }];
    }));
    const previousCourts = this.courts;
    this.courts = plans.map(plan => {
      const variation = (hash(plan.key) ^ this.seed) >>> 0;
      return previousCourts.find(c => c.plan.key === plan.key) ?? { plan, clock: 0, duration: plan.mode === "playing" ? .72 + (variation % 9) / 100 : 1.28 + (variation % 13) / 100 };
    });
    const validBalls = new Set(plans.flatMap(plan => plan.sequences.map((_, lane) => `${plan.key}:${lane}`)));
    this.ballsValue = this.ballsValue.filter(ball => validBalls.has(ball.id));
    if (reset) { this.arrivals.clear(); this.pressed = null; this.locked.clear(); }
    for (const id of this.arrivals.keys()) if (!this.actors.has(id)) this.arrivals.delete(id);
  }
  step(delta: number): boolean {
    if (!this.enabled) return false;
    const dt = Math.min(.05, Math.max(0, delta));
    const previousBalls = this.ballsValue; this.ballsValue = [];
    for (const runtime of this.actors.values()) {
      runtime.grace = Math.max(0, runtime.grace - dt);
      runtime.pose.held = runtime.actor.id === this.pressed || this.locked.has(runtime.actor.id) || runtime.grace > 0;
      if (runtime.actor.onCourt) continue;
      if (this.arrivals.get(runtime.actor.id) === false) { runtime.pose.offset = zero(); runtime.pose.walking = false; continue; }
      if (!runtime.pose.held) this.bench(runtime, dt);
    }
    for (const court of this.courts) {
      const ids = [...court.plan.white, ...court.plan.black];
      if (ids.some(id => this.arrivals.get(id) === false)) continue;
      if (ids.some(id => this.actors.get(id)?.pose.held)) { this.ballsValue.push(...previousBalls.filter(ball => ball.matchId === court.plan.matchId)); continue; }
      court.clock += dt;
      const live = court.plan.mode === "playing", ready = court.plan.mode === "ready";
      for (const id of ids) {
        const runtime = this.actors.get(id)!; const p = runtime.pose, phase = court.clock + (hash(id) % 31) / 7;
        p.action = court.plan.mode; p.held = false; p.walking = false;
        p.offset = [Math.sin(phase * (live ? 1.9 : .9)) * (live ? .38 : ready ? .065 : .13), 0, Math.sin(phase * 1.3) * (live ? .24 : ready ? .045 : .08)];
        p.yaw = runtime.actor.facing; p.swing = ready ? Math.sin(phase * 2) * .16 : 0;
        p.stretch = 0; p.look = Math.sin(phase * .9) * .15; p.gait = live ? Math.sin(phase * 8) * .24 : Math.sin(phase * 2) * .035;
      }
      for (let lane = 0; lane < court.plan.sequences.length; lane++) {
        const sequence = court.plan.sequences[lane];
        const phase = court.clock / court.duration + lane * .43;
        const index = Math.floor(phase), u = phase - index;
        const from = this.actors.get(sequence[index % sequence.length])!, to = this.actors.get(sequence[(index + 1) % sequence.length])!;
        const start = this.contact(from), end = this.contact(to);
        const bounce: Point = [end[0], .21, end[2] + (to.actor.side === "WHITE" ? -.9 : .9)];
        const t = u < .72 ? u / .72 : (u - .72) / .28;
        const position = u < .72 ? mix(start, bounce, t) : mix(bounce, end, t);
        position[1] += Math.sin(Math.PI * t) * (u < .72 ? live ? 1.05 : 1.4 : .23);
        this.ballsValue.push({ id: `${court.plan.key}:${lane}`, matchId: court.plan.matchId, position, bounce: Math.max(0, 1 - Math.abs(u - .72) / .08) });
        from.pose.swing = Math.max(from.pose.swing, Math.exp(-((u / .13) ** 2)));
        to.pose.swing = Math.max(to.pose.swing, Math.exp(-(((1 - u) / .18) ** 2)));
        for (const id of ids) {
          const runtime = this.actors.get(id)!;
          const toward = Math.atan2(position[0] - runtime.actor.base[0], position[2] - runtime.actor.base[2]);
          const angle = Math.atan2(Math.sin(toward - runtime.actor.facing), Math.cos(toward - runtime.actor.facing));
          runtime.pose.yaw = runtime.actor.facing + Math.max(-.5, Math.min(.5, angle));
        }
      }
    }
    return this.actors.size > 0;
  }
  private contact(runtime: Runtime): Point {
    const p = runtime.pose, a = runtime.actor;
    return [a.base[0] + p.offset[0] + (a.side === "WHITE" ? -.3 : .3), a.base[1] + .98, a.base[2] + p.offset[2] + (a.side === "WHITE" ? -.28 : .28)];
  }
  private bench(runtime: Runtime, dt: number) {
    const r = runtime.routine, p = runtime.pose; r.clock += dt;
    if (r.clock >= r.duration) {
      r.clock = 0; r.from = copy(p.offset);
      const choice = Math.floor(r.random() * 5);
      r.action = (["walk", "stretch", "paddle", "watch", "rest"] as const)[choice];
      r.to = r.action === "walk" ? [(r.random() - .5) * .52, 0, (r.random() - .5) * .8] : copy(p.offset);
      r.duration = r.action === "walk" ? Math.max(1.8, distance(r.from, r.to) / .23) : 1.8 + r.random() * 3;
    }
    const u = Math.min(1, r.clock / r.duration), ease = u * u * (3 - 2 * u), pulse = Math.sin(Math.PI * u);
    p.offset = mix(r.from, r.to, ease); p.action = r.action; p.walking = r.action === "walk";
    p.yaw = runtime.actor.facing + (r.action === "walk" ? Math.sin(Math.PI * u) * .5 * Math.sign(r.to[0] - r.from[0]) : 0);
    p.swing = r.action === "paddle" ? Math.sin(u * Math.PI * 5) * pulse * .35 : 0;
    p.stretch = r.action === "stretch" ? pulse : 0; p.look = r.action === "watch" ? Math.sin(u * Math.PI * 2) * .65 : Math.sin(u * Math.PI) * .08;
    p.gait = r.action === "walk" ? Math.sin(r.clock * 8) * .32 * pulse : 0;
  }
}
