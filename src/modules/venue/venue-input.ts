import type { SelectionBasis } from "./model";
import { CameraMotion } from "./camera-motion";
import { cameraView, clampZoom, constrainNavigation, orbitNavigation, type Navigation, type Point, type WorldLayout } from "./world";

export type PointerSample = { id: number; x: number; y: number };
type ScreenPoint = { x: number; y: number };
type Bounds = { left: number; top: number; width: number; height: number };
export type InputContext = { layout: WorldLayout; bounds: Bounds; editable: boolean; draggablePlayerIds?: readonly string[]; disabled: boolean; basis: SelectionBasis };
type Hit = { playerId?: string; pan?: boolean; ui?: boolean };
type Mode = "idle" | "orbit" | "pan" | "player" | "transform" | "await-release" | "ui";
export type InputEffects = {
  invalidate: () => void;
  capture: (id: number) => void;
  release: (id: number) => void;
  activity: (mode: Mode, playerId?: string) => void;
  select: (playerId: string) => void;
  drag: (playerId: string, x: number, y: number) => void;
  drop: (playerId: string, x: number, y: number, basis: SelectionBasis) => void;
  settled: () => void;
};

// Orthographic screen-to-floor mapping from the controller's current pose.
// A pointer sample can precede rendering; cloning the last rendered camera here
// would reintroduce stale-pose jumps when a second finger joins.
export function groundAt(point: ScreenPoint, nav: Navigation, layout: WorldLayout, bounds: Bounds): Point {
  const view = cameraView(nav, layout), radius = Math.hypot(...view.offset);
  const right: Point = [Math.cos(nav.yaw), 0, -Math.sin(nav.yaw)];
  const x = (point.x - bounds.left - bounds.width / 2) / view.zoom;
  const y = -(point.y - bounds.top - bounds.height / 2) / view.zoom;
  const screen = nav.center.map((n, i) => n + right[i] * x + view.up[i] * y) as Point;
  const direction = view.offset.map(n => -n / radius) as Point;
  const distance = (0.1 - screen[1]) / direction[1];
  return screen.map((n, i) => n + direction[i] * distance) as Point;
}

/** The single owner of pointer sequences, shared by DOM labels and mesh hits.
 * This class never stores match facts or commits commands. Cancellation always
 * drops previews; only one normal pointerup can emit a person/drop intent.
 */
export class VenueInput {
  private points = new Map<number, ScreenPoint>();
  private context: InputContext | null = null;
  private mode: Mode = "idle";
  private primary = 0;
  private origin: ScreenPoint = { x: 0, y: 0 };
  private previous: ScreenPoint = { x: 0, y: 0 };
  private previousDistance = 1;
  private moved = false;
  private playerId?: string;
  suppressClick = false;

  constructor(private motion: CameraMotion,
    private read: () => InputContext = () => { throw new Error("Venue input is not mounted"); },
    private effects: InputEffects = { invalidate() {}, capture() {}, release() {}, activity() {}, select() {}, drag() {}, drop() {}, settled() {} }) {}
  bind(read: () => InputContext, effects: InputEffects) { this.read = read; this.effects = effects; }
  get active() { return this.points.size > 0; }
  owns(id: number) { return this.points.has(id); }
  ground(point: ScreenPoint): Point | null {
    return this.context ? groundAt(point, this.motion.snapshot(), this.context.layout, this.context.bounds) : null;
  }
  lostCapture(id: number, retainedBySurface: boolean) {
    // Touch implicitly captures the original button/canvas. Its lost event
    // bubbles when we intentionally transfer capture to the venue surface.
    if (this.owns(id) && !retainedBySurface) this.cancel();
  }
  private activity() { this.effects.activity(this.mode, this.playerId); }
  private change(value: Navigation) {
    this.motion.move(constrainNavigation(value, this.context!.layout), true);
    this.effects.invalidate();
  }
  private canDrag(id: string) { return this.context!.editable && (!this.context!.draggablePlayerIds || this.context!.draggablePlayerIds.includes(id)); }
  down(sample: PointerSample, hit: Hit = {}) {
    const next = this.read();
    if (next.disabled || this.points.has(sample.id)) return;
    if (!this.active) {
      const { left, top, width, height } = next.bounds;
      this.context = { ...next, bounds: { left, top, width, height }, basis: { ...next.basis } };
      this.motion.stop();
      this.primary = sample.id; this.origin = this.previous = { x: sample.x, y: sample.y };
      this.moved = false; this.suppressClick = false;
      this.playerId = hit.playerId;
      this.mode = hit.ui ? "ui" : hit.playerId && this.canDrag(hit.playerId) ? "player" : hit.pan ? "pan" : "orbit";
    }
    this.points.set(sample.id, { x: sample.x, y: sample.y });
    if (this.points.size > 1) {
      this.playerId = undefined; this.mode = "transform"; this.moved = true; this.suppressClick = true;
      this.rebasePair();
      for (const id of this.points.keys()) this.effects.capture(id);
    } else if (hit.playerId) this.effects.capture(sample.id);
    this.activity();
  }
  // R3F resolves the body after the DOM capture handler has opened a sequence.
  claimPlayer(sample: PointerSample, id: string) {
    if (!this.active) { this.down(sample, { playerId: id }); return; }
    if (this.points.size !== 1 || this.primary !== sample.id || this.moved) return;
    this.playerId = id; this.mode = this.canDrag(id) ? "player" : "orbit";
    this.effects.capture(sample.id); this.activity();
  }
  private pair() {
    const [a, b] = [...this.points.values()];
    return { middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  private rebasePair() {
    const pair = this.pair(); this.previous = pair.middle; this.previousDistance = pair.distance;
  }
  private transform(point: ScreenPoint, zoom: number) {
    const current = this.motion.snapshot(), context = this.context!;
    const before = groundAt(this.previous, current, context.layout, context.bounds);
    const scaled = { ...current, zoom: clampZoom(zoom) };
    const after = groundAt(point, scaled, context.layout, context.bounds);
    this.change({ ...scaled, center: current.center.map((n, i) => n + before[i] - after[i]) as Point });
    // Advance even if an axis was constrained. No accumulated boundary debt.
    this.previous = { ...point };
  }
  move(sample: PointerSample) {
    if (!this.points.has(sample.id) || !this.context) return;
    const old = this.points.get(sample.id)!;
    if (old.x === sample.x && old.y === sample.y) return;
    this.points.set(sample.id, { x: sample.x, y: sample.y });
    if (this.mode === "await-release") return;
    if (this.mode === "ui") {
      if (Math.hypot(sample.x - this.origin.x, sample.y - this.origin.y) > 3) this.suppressClick = true;
      return;
    }
    if (this.mode === "transform") {
      const pair = this.pair();
      this.transform(pair.middle, this.motion.value.zoom * pair.distance / this.previousDistance);
      this.previousDistance = pair.distance; return;
    }
    if (sample.id !== this.primary) return;
    const threshold = this.mode === "player" ? 9 : 3;
    if (!this.moved && Math.hypot(sample.x - this.origin.x, sample.y - this.origin.y) > threshold) {
      this.moved = true; this.suppressClick = true;
      this.effects.capture(sample.id); this.activity();
    }
    if (this.mode === "player") {
      if (this.moved) this.effects.drag(this.playerId!, sample.x, sample.y);
    } else if (this.mode === "pan") this.transform(sample, this.motion.value.zoom);
    else {
      this.change(orbitNavigation(this.motion.snapshot(), sample.x - this.previous.x, sample.y - this.previous.y, this.context.bounds.height));
      this.previous = { x: sample.x, y: sample.y };
    }
  }
  up(sample: PointerSample) {
    if (!this.points.has(sample.id)) return;
    // pointerup may contain a final position that had no preceding pointermove.
    this.move(sample);
    const person = this.playerId, context = this.context!, mode = this.mode;
    this.points.delete(sample.id);
    // Delete before release: normal lostpointercapture must not cancel peers.
    this.effects.release(sample.id);
    if (mode === "transform" || mode === "await-release") {
      this.suppressClick = true;
      this.mode = this.points.size >= 2 ? "transform" : "await-release";
      if (this.points.size >= 2) this.rebasePair();
    } else if (sample.id === this.primary && person) {
      this.suppressClick = true;
      if (!this.moved) this.effects.select(person);
      else if (mode === "player" && context.editable) this.effects.drop(person, sample.x, sample.y, context.basis);
    }
    if (!this.active) this.end();
  }
  cancel() {
    const ids = [...this.points.keys()]; this.points.clear();
    this.suppressClick = true; this.motion.stop();
    for (const id of ids) this.effects.release(id);
    this.end();
  }
  private end() {
    this.context = null; this.mode = "idle"; this.playerId = undefined; this.moved = false;
    this.activity(); this.effects.invalidate(); this.effects.settled();
  }
}
