import type { Slot } from "../competition";

export type Point = [number, number, number];
export type WorldLayout = ReturnType<typeof worldLayout>;
export type Navigation = { center: Point; zoom: number };
export const BOARD_OFFSET: Point = [0, 1.5, -5.5];
export const overview = (): Navigation => ({ center: [0, 0, 0], zoom: 1 });
export const clampZoom = (zoom: number) => Math.max(1, Math.min(3, zoom));

// Layout depends on the viewport only. Selecting a court never moves an entity.
export function worldLayout(width: number, height: number) {
  const portrait = width / height < 1.1;
  const compact = portrait && height < 680;
  return {
    portrait, compact,
    width: portrait ? 14.5 : 28,
    length: portrait ? compact ? 42 : 48 : 22,
    baseZoom: Math.min(width / (portrait ? 18.8 : 32), height / (portrait ? 36 : 25)),
    cameraOffset: (portrait ? [3, 36, 42] : [14, 28, 32]) as Point,
  };
}

export function courtCenter(number: number, layout: WorldLayout): Point {
  return layout.portrait ? [0, 0.12, (number - 2) * (layout.compact ? 13 : 15)] : [(number - 2) * 7.2, 0.12, 0];
}
export function boardCenter(number: number, layout: WorldLayout): Point {
  const center = courtCenter(number, layout);
  return center.map((n, i) => n + BOARD_OFFSET[i]) as Point;
}
export function slotPosition(slot: Slot, slots: Slot[]): Point {
  const side = slots.filter(s => s.sideId === slot.sideId);
  const index = side.findIndex(s => s.id === slot.id);
  return [side.length === 1 ? 0 : index === 0 ? -1.5 : 1.5, 0.06, slot.sideId === "WHITE" ? 3.15 : -3.15];
}
export function courtNavigation(number: number, layout: WorldLayout): Navigation {
  return { center: courtCenter(number, layout), zoom: layout.portrait ? 1.7 : 1.8 };
}
export function constrainNavigation(nav: Navigation, layout: WorldLayout): Navigation {
  const zoom = clampZoom(nav.zoom);
  if (zoom === 1) return overview();
  return { zoom, center: [Math.max(-layout.width / 2, Math.min(layout.width / 2, nav.center[0])), 0.12, Math.max(-layout.length / 2, Math.min(layout.length / 2, nav.center[2]))] };
}
