import type { EventProjection, EventState } from "../competition";
import { avatarRoute, type TravelMode } from "./avatar-motion";
import { benchRows, courtCenter, playerPlacement, type Point, type WorldLayout } from "./world";
type Placement = ReturnType<typeof playerPlacement>;
const separation = 2.8;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const same = (a: Point, b: Point) => a.every((n, i) => Math.abs(n - b[i]) < .001);
/** Closest available point in the two end waiting rows, generated continuously from the
 * visible origin and nearby people. No roster index or fixed exit is involved. */
export function nearestBenchPoint(from: Point, layout: WorldLayout, occupied: readonly Point[] = [], mode: TravelMode = "walk"): Point {
  const rows = benchRows(layout), candidates: Point[] = [];
  for (const [left, right, z] of rows) {
    const add = (x: number) => candidates.push([Math.max(left, Math.min(right, x)), .07, z]);
    add(from[0]); add(left); add(right);
    // Exact exclusion boundaries on each line, rather than projecting an
    // angular sample back to the row and accidentally losing feasible gaps.
    for (const person of occupied) {
      const dz = person[2] - z;
      if (Math.abs(dz) < separation) {
        const dx = Math.sqrt(separation * separation - dz * dz); add(person[0] - dx); add(person[0] + dx);
      }
    }
    for (const n of [1, 2, 3]) { const c = courtCenter(n, layout)[0]; add(c - 3.25); add(c + 3.25); }
    const pins = occupied.filter(p => Math.abs(p[2] - z) < separation).map(p => p[0]).sort((a,b) => a-b);
    for (let i = 1; i < pins.length; i++) add((pins[i-1] + pins[i]) / 2);
  }
  const clearance = (point: Point) => Math.min(...occupied.map(other => distance(point, other)), Infinity);
  let available = candidates.filter(point => clearance(point) >= separation - 1e-6);
  if (!available.length) {
    // An unusually spread-out crowd can cover both lines at the preferred
    // spacing. Use the widest remaining gap, never an overlapping old seat.
    const widest = Math.max(...candidates.map(clearance));
    available = candidates.filter(point => clearance(point) >= widest - 1e-6);
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
