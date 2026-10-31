import { finaleOutcome, type EventState, type TeamId } from "../competition";
import { AVATAR_SCALE } from "./paddle-pose";
import type { BallPose, ActorPose } from "./local-choreography";
import type { Point } from "./world";
export type FinalePlacement = { position: Point; facing: number; onCourt: boolean; sideId: TeamId | null };
export type FinalePlan = { key: string; winner: TeamId | null; totals: Record<TeamId, number>; winners: string[]; receivers: string[]; angel: string | null; placements: Record<string, FinalePlacement> };
export const COMPLETION_ROW_GAP = 3.05;
export const COMPLETION_COLUMN_X = 3.65;
/** Two stable queues of real players. Outcome changes accents, never membership or order. */
export function planFinale(state: EventState): FinalePlan | undefined {
  const outcome = finaleOutcome(state); if (!outcome.unlocked) return;
  const winners = outcome.winner ? state.players.filter(p => p.teamId === outcome.winner).map(p => p.id) : [];
  const receivers = outcome.loser ? state.players.filter(p => p.teamId === outcome.loser).map(p => p.id) : [];
  const angel = state.players.find(p => p.teamId === "FREE")?.id ?? null;
  const placements: FinalePlan["placements"] = {};
  for (const team of ["WHITE", "BLACK"] as const) {
    const people = state.players.filter(p => p.teamId === team), side = team === "WHITE" ? -1 : 1;
    people.forEach((p, i) => {
      placements[p.id] = { position: [side * COMPLETION_COLUMN_X, .18, (i - (people.length - 1) / 2) * COMPLETION_ROW_GAP], facing: -side * Math.PI / 2, onCourt: true, sideId: team };
    });
  }
  if (angel) placements[angel] = { position: [0, .18, 0], facing: 0, onCourt: true, sideId: null };
  return { key: state.id + ":" + state.generation + ":finale:" + outcome.winner + ":" + outcome.totals.WHITE + ":" + outcome.totals.BLACK, winner: outcome.winner, totals: outcome.totals, winners, receivers, angel, placements };
}
export function angelFinale(clock: number) {
  const time = Math.max(0, clock), angle = time * .33, u = Math.min(1, time / 1.4), rise = u * u * (3 - 2 * u);
  return { offset: [Math.sin(angle * 2) * .65 * rise, 0, Math.sin(angle) * 8 * rise] as Point,
    yaw: Math.atan2(1.3 * Math.cos(angle * 2), 8 * Math.cos(angle)), lift: .19 + rise * (1.51 + Math.sin(time * .9) * .16) };
}
/** Uses the existing browser-local clock. A completed event never emits rally balls. */
export function sampleFinale(plan: FinalePlan, clock: number) {
  const poses = new Map<string, Partial<ActorPose>>(), balls: BallPose[] = [];
  let index = 0;
  for (const [id, placement] of Object.entries(plan.placements)) {
    const pulse = Math.sin(clock * 1.3 + index++ * 1.7), celebrating = !plan.winner || plan.winners.includes(id);
    poses.set(id, { offset: [0, 0, 0], yaw: placement.facing, swing: celebrating ? pulse * .09 : 0,
      stretch: celebrating ? .24 + pulse * .07 : .11, look: pulse * .1, gait: 0, walking: false, action: celebrating ? "completion-salute" : "completion-watch" });
  }
  if (plan.angel) {
    const flight = angelFinale(clock);
    poses.set(plan.angel, { offset: flight.offset, yaw: flight.yaw, walking: true, action: "finale-confetti", stretch: .55 + Math.sin(clock * 3) * .2, stroke: { lift: flight.lift, arm: [-.65 + Math.sin(clock * 3) * .25, 0, -.65] } });
  }
  return { poses, balls };
}
export const FINALE_CONFETTI_COUNT = 112;
export function confettiPose(clock: number, index: number) {
  const life = 2.7 + (index % 7) * .19, age = (clock + index * .137) % life, emitter = angelFinale(clock - age);
  return { position: [emitter.offset[0] + Math.sin(index * 2.4) * age * .23, .18 + emitter.lift * AVATAR_SCALE + 1.5 - age * .96, emitter.offset[2] + Math.cos(index * 1.7) * age * .26] as Point,
    rotation: [clock * (1 + index % 3), clock * .7 + index, Math.sin(clock * 2 + index)] as Point,
    scale: clock - age < 0 ? [0, 0, 0] as Point : [index % 7 === 0 ? .08 : .16, index % 7 === 0 ? .90 : .25, 1] as Point };
}
