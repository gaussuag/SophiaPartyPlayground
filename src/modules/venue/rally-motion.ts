import { angelPose } from "./angel-pose";
import { paddleContact, STRIKE_ARM } from "./paddle-pose";
import type { Point } from "./world";
export type RallyActor = { id: string; base: Point; free: boolean };
export type StrokePose = { arm: Point; lift: number };
export type RallyActorPose = { offset: Point; yaw: number; stroke: StrokePose; swing: number };
export type RallyBall = {
  position: Point; tail: Point; bounce: number; phase: number; source: string; receiver: string;
  impact?: { center: Point; normal: Point; strength: number };
};
type Contact = { id: string; offset: Point; yaw: number; lift: number; center: Point; normal: Point; ball: Point };
const ready: Point = [-.22, 0, -.12], windup: Point = [.14, .48, .06], follow: Point = [-1.5, -.32, -.22];
const mix = (a: Point, b: Point, t: number): Point => a.map((v, i) => v + (b[i] - v) * t) as Point;
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const hash = (id: string) => [...id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);
/** Bounded browser-local contact timeline. Every hit has an immutable future
 * pose, shared by receiving movement and flight endpoints. No moving target
 * chase, per-frame scene reads, event data mutation or independent clock. */
export class RallyTimeline {
  private contacts = new Map<number, Contact>();
  private actors: Map<string, RallyActor>;
  private ids: string[];
  private sides: string[][];
  private centerX: number;
  constructor(readonly sequence: readonly string[], actors: RallyActor[], readonly duration: number, readonly phaseOffset: number, readonly live: boolean, private seed = 1) {
    this.actors = new Map(actors.map(a => [a.id, a]));
    this.ids = [...new Set(sequence)];
    this.sides = [0, 1].map(side => [...new Set(sequence.filter((_, i) => i % 2 === side))]);
    const xs = actors.filter(a => this.ids.includes(a.id)).map(a => a.base[0]);
    this.centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  // Indexed randomness keeps past/future contact queries identical regardless
  // of sample order; no growing shot history or per-frame random destinations.
  private random(index: number, channel: number) {
    let value = (this.seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) >>> 0;
    value = Math.imul(value ^ value >>> 16, 0x7feb352d); value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return ((value ^ value >>> 16) >>> 0) / 4294967296;
  }
  private id(index: number) {
    if (!this.live) return this.sequence[(index % this.sequence.length + this.sequence.length) % this.sequence.length];
    const side = (index % 2 + 2) % 2, people = this.sides[side];
    const turn = Math.floor(index / 2), block = Math.floor(turn / people.length);
    // Shuffle each pair of a side's turns. Everyone takes a turn, while the
    // opponent/straight/cross-court pattern changes between successive pairs.
    const reverse = people.length > 1 && this.random(block, side) < .5;
    const slot = (turn % people.length + people.length) % people.length;
    return people[reverse ? people.length - 1 - slot : slot];
  }
  private contact(index: number): Contact {
    let contact = this.contacts.get(index);
    if (!contact) {
      const actor = this.actors.get(this.id(index))!, previous = this.actors.get(this.id(index - 1))!, next = this.actors.get(this.id(index + 1))!;
      const phase = index * 1.13 + hash(actor.id) % 17;
      const offset: Point = this.live ? [(this.random(index, 2) - .5) * 1.30, 0, (this.random(index, 3) - .5) * 1.10]
        : [Math.sin(phase) * .09, 0, Math.cos(phase * .7) * .045];
      const yaw = Math.atan2((previous.base[0] + next.base[0]) / 2 - actor.base[0], (previous.base[2] + next.base[2]) / 2 - actor.base[2]);
      const time = (index - this.phaseOffset) * this.duration, lift = actor.free ? angelPose(time, false, false).lift : 0;
      const root = actor.base.map((v, i) => v + offset[i]) as Point;
      let face = paddleContact(root, yaw, lift);
      if (this.live) {
        const adjustment = Math.max(this.centerX - 2.65, Math.min(this.centerX + 2.65, face.ball[0])) - face.ball[0];
        offset[0] += adjustment; root[0] += adjustment; face = paddleContact(root, yaw, lift);
      }
      contact = { id: actor.id, offset, yaw, lift, ...face };
      this.contacts.set(index, contact);
    }
    return contact;
  }
  private arm(since: number, until: number): Point {
    if (since < .14) return mix(STRIKE_ARM, follow, smooth(since / .14));
    if (since < .42) return mix(follow, ready, smooth((since - .14) / .28));
    if (until < .14) return mix(windup, STRIKE_ARM, smooth(1 - until / .14));
    if (until < .38) return mix(ready, windup, smooth(1 - (until - .14) / .24));
    return [...ready];
  }
  private shot(start: Point, end: Point, index: number) {
    const bounce: Point = [end[0], .265, end[2] + Math.sign(start[2] - end[2]) * (this.live ? .65 + this.random(index, 4) * .85 : .95)];
    if (this.live) bounce[0] = Math.max(this.centerX - 2.65, Math.min(this.centerX + 2.65, bounce[0] + (this.random(index, 5) - .5) * .7));
    const crossing = -start[2] / (bounce[2] - start[2]);
    const netArc = (1.18 - (start[1] + (.265 - start[1]) * crossing)) / Math.max(.05, Math.sin(Math.PI * crossing));
    return { bounce, at: this.live ? .61 + this.random(index, 6) * .16 : .70,
      arc: Math.max(this.live ? .95 + this.random(index, 7) * .85 : 1.3, netArc), rebound: this.live ? .10 + this.random(index, 8) * .18 : .16 };
  }
  private flight(start: Point, end: Point, phase: number, shot: ReturnType<RallyTimeline["shot"]>): Point {
    const first = phase < shot.at, t = first ? phase / shot.at : (phase - shot.at) / (1 - shot.at);
    const p = first ? mix(start, shot.bounce, t) : mix(shot.bounce, end, t);
    p[1] += Math.sin(Math.PI * t) * (first ? shot.arc : shot.rebound); return p;
  }
  sample(clock: number) {
    const raw = clock / this.duration + this.phaseOffset, rounded = Math.round(raw);
    const phase = Math.abs(raw - rounded) < 1e-9 ? rounded : raw, index = Math.floor(phase), u = phase - index;
    const from = this.contact(index), to = this.contact(index + 1), poses = new Map<string, RallyActorPose>();
    for (const id of this.ids) {
      let before = index; while (this.id(before) !== id) before--;
      let after = before + 1; while (this.id(after) !== id) after++;
      const a = this.contact(before), b = this.contact(after), t = smooth((phase - before) / (after - before));
      const since = (phase - before) * this.duration, until = (after - phase) * this.duration;
      const actor = this.actors.get(id)!;
      poses.set(id, { offset: mix(a.offset, b.offset, t), yaw: angle(a.yaw, b.yaw, t),
        stroke: { arm: this.arm(since, until), lift: actor.free ? angelPose(clock, false, false).lift : 0 },
        swing: Math.max(Math.exp(-((since / .10) ** 2)), Math.exp(-((until / .10) ** 2))) });
    }
    const elapsed = u * this.duration, shot = this.shot(from.ball, to.ball, index);
    const ball: RallyBall = {
      position: this.flight(from.ball, to.ball, u, shot), tail: this.flight(from.ball, to.ball, Math.max(0, u - .026), shot),
      bounce: Math.max(0, 1 - Math.abs(u - shot.at) / .045), phase: u, source: from.id, receiver: to.id,
      ...(elapsed < .10 ? { impact: { center: from.center, normal: from.normal, strength: 1 - elapsed / .10 } } : {}),
    };
    for (const n of this.contacts.keys()) if (n < index - this.sequence.length - 1 || n > index + this.sequence.length + 1) this.contacts.delete(n);
    return { poses, ball };
  }
}
