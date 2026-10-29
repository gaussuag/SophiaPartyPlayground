import type { Point, WorldLayout } from "./world";

export const PLAY_IDS = ["ball", "mascot", "fan"] as const;
export type PlayId = typeof PLAY_IDS[number];
export type PlaySnapshot = Readonly<Record<PlayId, boolean>>;
const resting: PlaySnapshot = Object.freeze({ ball: false, mascot: false, fan: false });
const durations: Record<PlayId, number> = { ball: 2700, mascot: 2300, fan: 10000 };
type Activity = { started: number; ends: number };

/** Local presentation only. No event, player, match, or persistence identity enters here. */
export class ScenePlayController {
  private activities = new Map<PlayId, Activity>();
  private listeners = new Set<() => void>();
  private snapshot: PlaySnapshot = resting;
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => resting;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  activate(id: PlayId, now: number) {
    this.advance(now);
    if (this.activities.has(id)) {
      if (id !== "fan") return false;
      this.activities.delete(id);
    } else this.activities.set(id, { started: now, ends: now + durations[id] });
    this.publish();
    return true;
  }
  advance(now: number) {
    let changed = false;
    for (const [id, activity] of this.activities) {
      if (now >= activity.ends) { this.activities.delete(id); changed = true; }
    }
    if (changed) this.publish();
  }
  cancel() {
    if (!this.activities.size) return;
    this.activities.clear(); this.publish();
  }
  get nextDeadline() {
    return Math.min(...Array.from(this.activities.values(), activity => activity.ends));
  }
  get active() { return this.activities.size > 0; }
  elapsed(id: PlayId, now: number) {
    const activity = this.activities.get(id);
    return activity ? Math.max(0, Math.min(1, (now - activity.started) / durations[id])) : null;
  }
  private publish() {
    this.snapshot = Object.freeze({ ball: this.activities.has("ball"), mascot: this.activities.has("mascot"), fan: this.activities.has("fan") });
    for (const listener of this.listeners) listener();
  }
}

/** A pointer excursion, cancel, or second finger cannot become a toy click. */
export class PlayTap {
  private pointers = new Set<number>();
  private candidate: { id: number; x: number; y: number; valid: boolean } | null = null;
  down(id: number, x: number, y: number) {
    this.pointers.add(id);
    if (this.pointers.size === 1) this.candidate = { id, x, y, valid: true };
    else if (this.candidate) this.candidate.valid = false;
  }
  move(id: number, x: number, y: number) {
    const candidate = this.candidate;
    if (candidate?.id === id && Math.hypot(x - candidate.x, y - candidate.y) > 6) candidate.valid = false;
  }
  up(id: number, x: number, y: number) { this.move(id, x, y); this.pointers.delete(id); }
  lost(id: number) { if (this.pointers.has(id)) this.cancel(); }
  cancel() { this.pointers.clear(); this.candidate = null; }
  consume(x: number, y: number) {
    const candidate = this.candidate;
    this.cancel();
    return !!candidate?.valid && Math.hypot(x - candidate.x, y - candidate.y) <= 6;
  }
}

export function playPositions(layout: WorldLayout): Record<PlayId, Point> {
  // The front apron is outside the last baseline and outside both player aisles.
  const z = layout.portrait ? layout.courtSpacing + 6.65 : 10.1;
  const xs = layout.portrait ? [-3.6, 0, 3.6] : [-5.4, 1.8, 9];
  return { ball: [xs[0], 0.1, z], mascot: [xs[1], 0.1, z], fan: [xs[2], 0.1, z] };
}

export function playPose(controller: ScenePlayController, now: number, reduced: boolean) {
  const ball = controller.elapsed("ball", now), mascot = controller.elapsed("mascot", now), fan = controller.elapsed("fan", now);
  const bounce = ball === null || reduced ? 0 : Math.abs(Math.sin(ball * Math.PI * 3)) * (1 - ball) * 1.4;
  const wave = mascot === null ? 0 : reduced ? 1 : Math.sin(Math.min(1, mascot * 5) * Math.PI / 2) * Math.sin(Math.min(1, (1 - mascot) * 5) * Math.PI / 2);
  return {
    ballX: ball === null || reduced ? 0 : Math.sin(ball * Math.PI) * 0.6,
    ballY: 0.35 + bounce,
    ballTurn: ball === null || reduced ? 0 : Math.sin(ball * Math.PI) * 3,
    wave: mascot === null ? 0 : wave * (reduced ? -0.85 : -0.85 + Math.sin(mascot * Math.PI * 12) * 0.28),
    mascotTilt: mascot === null || reduced ? 0 : Math.sin(mascot * Math.PI * 2) * 0.09,
    fanTurn: fan === null || reduced ? 0 : fan * 160,
    fanTilt: fan === null || reduced ? 0 : Math.sin(fan * Math.PI * 4) * 0.25,
  };
}
