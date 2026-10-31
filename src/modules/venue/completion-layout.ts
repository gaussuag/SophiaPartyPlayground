import type { Point } from "./world";
export const COMPLETION_ROW_GAP = 2.2;
export const COMPLETION_COLUMN_X = 2.05;
export const COMPLETION_ARC = .3;
export const COMPLETION_FLIGHT_Z = 3.6;
export const COMPLETION_FLIGHT_X = .42;
/** Shared physical envelope keeps procession, flight and camera framing in agreement. */
export function completionPlace(index: number, count: number, side: number) {
  const u = count > 1 ? index * 2 / (count - 1) - 1 : 0;
  return { position: [side * (COMPLETION_COLUMN_X + COMPLETION_ARC * (1 - u * u)), .18, (index - (count - 1) / 2) * COMPLETION_ROW_GAP] as Point,
    facing: -side * Math.PI * .36 };
}
export function completionEnvelope(rows: number, pitch: number) {
  const half = Math.max(0, rows - 1) * COMPLETION_ROW_GAP / 2;
  return { top: Math.max(half * Math.sin(pitch) + 3.1 * Math.cos(pitch), COMPLETION_FLIGHT_Z * Math.sin(pitch) + 4.8 * Math.cos(pitch)),
    bottom: -(half + .5) * Math.sin(pitch), width: 7.8 };
}
