import type { EventProjection, EventState } from "../competition";
import { avatarRoute, type TravelMode } from "./avatar-motion";
import { benchAreas, courtCenter, playerPlacement, type Point, type WorldLayout } from "./world";
type Placement = ReturnType<typeof playerPlacement>;
const separation = 2.8;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const same = (a: Point, b: Point) => a.every((n, i) => Math.abs(n - b[i]) < .001);
/** Closest available court-side waiting point, generated continuously from the
 * visible origin and nearby people. No roster index or fixed exit is involved. */
export function nearestBenchPoint(from: Point, layout: WorldLayout, occupied: readonly Point[] = [], mode: TravelMode = "walk"): Point {
  const areas = benchAreas(layout), candidates: Point[] = [];
  const add = (x: number, z: number) => {
    for (const [left, right, back, front] of areas) candidates.push([Math.max(left, Math.min(right, x)), .07, Math.max(back, Math.min(front, z))]);
  };
  add(from[0], from[2]);
  for (const person of occupied) {
    const angle = Math.atan2(from[2] - person[2], from[0] - person[0]);
    for (let i = 0; i < 16; i++) add(person[0] + Math.cos(angle + i * Math.PI / 8) * separation, person[2] + Math.sin(angle + i * Math.PI / 8) * separation);
  }
  const clear = (point: Point) => occupied.every(other => distance(point, other) >= separation - 1e-6);
  let available = candidates.filter(clear);
  if (!available.length) {
    for (const [left, right, back, front] of areas) for (let x = left; x <= right; x += .45) for (let z = back; z <= front; z += .45) { const p: Point = [x, .07, z]; if (clear(p)) available.push(p); }
  }
  available = available.sort((a, b) => distance(from, a) - distance(from, b));
  let best = available[0] ?? candidates[0], cost = Infinity;
  for (const candidate of available) {
    if (distance(from, candidate) > cost + 1e-6) break;
    let length = 0, previous = from;
    for (const point of avatarRoute(from, candidate, layout, mode)) { length += distance(previous, point); previous = point; }
    if (length < cost) { best = candidate; cost = length; }
  }
  return [...best];
}
/** Browser-local destination ownership shared by motion and idle choreography.
 * New rounds leave players at nearby edges; history/restore establish a fresh
 * scene. No coordinates are written to EventState or sent over the network. */
export class AvatarPlacements {
  private values = new Map<string, Placement>();
  private owner = "";
  private round = "";
  private number = 0;
  private live = false;
  private epoch = 0;
  private modes = new Map<string, TravelMode>();
  context = "initial";
  get(playerId: string) { return this.values.get(playerId); }
  exitFor(playerId: string, layout: WorldLayout, visible?: Point) {
    const current = this.values.get(playerId)!;
    return nearestBenchPoint(visible ?? current.position, layout, [...this.values].filter(([id]) => id !== playerId).map(([, p]) => p.position), this.modes.get(playerId));
  }
  sync(state: EventState, view: EventProjection, layout: WorldLayout, visible: (id: string) => Point | undefined = () => undefined) {
    const owner = `${state.id}:${state.generation}`;
    const advancing = owner === this.owner && this.live && view.isCurrent && view.round.number === this.number + 1;
    const reset = owner !== this.owner || view.round.id !== this.round && !advancing;
    const previous = reset ? new Map<string, Placement>() : this.values;
    if (reset) this.context = `${owner}:visit-${++this.epoch}`;
    const next = new Map<string, Placement>(), departures: string[] = [];
    this.modes = new Map(state.players.map(p => [p.id, p.teamId === "FREE" ? "fly" : "walk"]));
    for (const player of state.players) {
      const canonical = playerPlacement(state, view, player.id, layout), old = previous.get(player.id);
      if (!canonical.onCourt && old?.onCourt) departures.push(player.id);
      else next.set(player.id, !canonical.onCourt && old && !old.onCourt ? old : canonical);
    }
    for (const id of departures) {
      const from = visible(id) ?? previous.get(id)!.position;
      const position = nearestBenchPoint(from, layout, [...next.values()].map(p => p.position), this.modes.get(id));
      const court = [1, 2, 3].map(number => courtCenter(number, layout)).sort((a, b) => distance(a, position) - distance(b, position))[0];
      next.set(id, { position, onCourt: false, sideId: null, facing: Math.atan2(court[0] - position[0], court[2] - position[2]) });
    }
    // Keep object identities for unchanged destinations, including prediction ACKs.
    for (const [id, pose] of next) { const old = previous.get(id); if (old && old.onCourt === pose.onCourt && old.facing === pose.facing && same(old.position, pose.position)) next.set(id, old); }
    this.values = next; this.owner = owner; this.round = view.round.id; this.number = view.round.number; this.live = view.isCurrent;
  }
}
