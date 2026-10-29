import type { Navigation } from "./world";

const copy = (pose: Navigation): Navigation => ({ ...pose, center: [...pose.center] });
const angleDelta = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// One owner for the rendered pose. Finger input is direct; only explicit
// focus/reset requests animate. Never interpolate Cartesian orbit positions.
export class CameraMotion {
  private pose: Navigation;
  private destination: Navigation;
  private transitioning = false;
  private resume: Navigation | null = null;

  constructor(initial: Navigation) { this.pose = copy(initial); this.destination = copy(initial); }
  get value() { return this.pose; }
  get moving() { return this.transitioning; }
  snapshot() { return copy(this.pose); }
  get beforeEditor() { return this.resume ?? this.pose; }
  openEditor(pose: Navigation) { if (!this.resume) this.resume = this.snapshot(); this.move(pose); }
  closeEditor() { if (this.resume) { const pose = this.resume; this.resume = null; this.move(pose); } }

  move(pose: Navigation, direct = false) {
    this.destination = copy(pose);
    this.transitioning = !direct;
    if (direct) this.pose = copy(pose);
  }
  stop() { this.destination = copy(this.pose); this.transitioning = false; }

  step(delta: number, reducedMotion = false) {
    if (!this.transitioning) return false;
    const factor = reducedMotion ? 1 : 1 - Math.exp(-14 * Math.max(0, Math.min(0.1, delta)));
    const p = this.pose, target = this.destination;
    p.yaw += angleDelta(target.yaw, p.yaw) * factor;
    p.pitch += (target.pitch - p.pitch) * factor;
    p.zoom += (target.zoom - p.zoom) * factor;
    for (let i = 0; i < 3; i++) p.center[i] += (target.center[i] - p.center[i]) * factor;
    this.transitioning = Math.abs(angleDelta(target.yaw, p.yaw)) > 0.0001 || Math.abs(target.pitch - p.pitch) > 0.0001 || Math.abs(target.zoom - p.zoom) > 0.001 || p.center.some((n, i) => Math.abs(n - target.center[i]) > 0.001);
    if (!this.transitioning) this.pose = copy(target);
    return this.transitioning;
  }
}
