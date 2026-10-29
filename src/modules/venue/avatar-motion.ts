import { courtCenter, type Point, type WorldLayout } from "./world";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const copy = (point: Point): Point => [...point];
const angleDelta = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
type Obstacle = { x: number; z: number };
const HALF_WIDTH = 3.35, HALF_LENGTH = 5.8, CLEARANCE = 0.08;

function inside(point: Point, court: Obstacle) {
  return Math.abs(point[0] - court.x) < HALF_WIDTH && Math.abs(point[2] - court.z) < HALF_LENGTH;
}

// Open-rectangle intersection: touching an aisle edge is allowed, crossing a
// court is not. The body radius is already included in the obstacle dimensions.
function blocked(a: Point, b: Point, court: Obstacle) {
  let enter = 0, leave = 1;
  for (const [axis, center, half] of [[0, court.x, HALF_WIDTH], [2, court.z, HALF_LENGTH]] as const) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-8) {
      if (a[axis] <= center - half || a[axis] >= center + half) return false;
    } else {
      const first = (center - half - a[axis]) / d, last = (center + half - a[axis]) / d;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
    }
  }
  return enter < leave - 1e-7 && leave > 0 && enter < 1;
}

/** Presentation-only path. Court side doors and a tiny visibility graph keep
 * every intermediate segment in an aisle, including when a walk is retargeted. */
export function avatarRoute(from: Point, to: Point, layout: WorldLayout): Point[] {
  if (distance(from, to) < 0.001) return [copy(to)];
  const courts = [1, 2, 3].map(number => { const c = courtCenter(number, layout); return { x: c[0], z: c[2] }; });
  const source = courts.find(c => inside(from, c)), destination = courts.find(c => inside(to, c));
  if (source && source === destination && (from[2] - source.z) * (to[2] - source.z) > 0.01) return [copy(to)];
  const portals = (point: Point, court?: Obstacle): Point[] => court ? [-1, 1].map(side => [court.x + side * (HALF_WIDTH + CLEARANCE), point[1], point[2]]) : [copy(point)];
  const starts = portals(from, source), ends = portals(to, destination);
  const corners: Point[] = courts.flatMap(c => [-1, 1].flatMap(x => [-1, 1].map(z => [c.x + x * (HALF_WIDTH + CLEARANCE), to[1], c.z + z * (HALF_LENGTH + CLEARANCE)] as Point)));
  const nodes = [...starts, ...ends, ...corners], costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  starts.forEach((p, i) => { costs[i] = distance(from, p); });
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (at === -1 || costs[i] < costs[at])) at = i;
    if (at === -1 || !Number.isFinite(costs[at])) break;
    visited.add(at);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || courts.some(c => blocked(nodes[at], nodes[i], c))) continue;
      const cost = costs[at] + distance(nodes[at], nodes[i]);
      if (cost < costs[i]) { costs[i] = cost; previous[i] = at; }
    }
  }
  let end = starts.length;
  for (let i = starts.length; i < starts.length + ends.length; i++) if (costs[i] + distance(nodes[i], to) < costs[end] + distance(nodes[end], to)) end = i;
  const route: Point[] = [copy(to)];
  for (let at = end; at !== -1; at = previous[at]) route.unshift(copy(nodes[at]));
  return route.filter((point, i) => distance(i ? route[i - 1] : from, point) > 0.001);
}

export class AvatarMotion {
  position: Point;
  yaw: number;
  travelled = 0;
  private target: Point;
  private destinationYaw: number;
  private route: Point[] = [];
  private context: string;

  constructor(position: Point, yaw: number, context: string) {
    this.position = copy(position); this.target = copy(position); this.yaw = yaw; this.destinationYaw = yaw; this.context = context;
  }
  get walking() { return this.route.length > 0; }
  get moving() { return this.walking || Math.abs(angleDelta(this.destinationYaw, this.yaw)) > 0.005; }
  get destination() { return copy(this.target); }
  retarget(target: Point, yaw: number, layout: WorldLayout, context: string, reduced = false) {
    const reset = context !== this.context;
    this.context = context;
    const changed = distance(this.target, target) > 0.001 || this.target[1] !== target[1];
    this.target = copy(target); this.destinationYaw = yaw;
    if (reset || reduced) this.snap();
    else if (changed) this.route = avatarRoute(this.position, target, layout);
  }
  snap() { this.position = copy(this.target); this.yaw = this.destinationYaw; this.route = []; }
  step(delta: number, reduced = false) {
    if (reduced) { this.snap(); return false; }
    const dt = Math.min(0.05, Math.max(0, delta));
    const next = this.route[0];
    const heading = next ? Math.atan2(next[0] - this.position[0], next[2] - this.position[2]) : this.destinationYaw;
    const turn = angleDelta(heading, this.yaw), turnStep = Math.min(Math.abs(turn), dt * 11);
    this.yaw += Math.sign(turn) * turnStep;
    if (next && Math.abs(turn) < 0.35) {
      const remaining = distance(this.position, next), amount = Math.min(remaining, dt * 6.5);
      const factor = remaining < 0.001 ? 1 : amount / remaining;
      this.position = this.position.map((n, i) => n + (next[i] - n) * factor) as Point;
      this.travelled += amount;
      if (remaining <= amount + 0.001) { this.position = copy(next); this.route.shift(); }
    }
    if (!this.route.length && Math.abs(angleDelta(this.destinationYaw, this.yaw)) < 0.005) { this.yaw = this.destinationYaw; this.position = copy(this.target); }
    return this.moving;
  }
}
