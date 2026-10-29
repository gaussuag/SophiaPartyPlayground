import type { Slot } from "../competition";

export type Point = [number, number, number];
export type WorldLayout = ReturnType<typeof worldLayout>;
export type Navigation = { center: Point; zoom: number };
export const BOARD_SIZE = { width: 112, faceHeight: 36, frameWidth: 120, frameHeight: 40 };
export const overview = (layout?: WorldLayout): Navigation => ({ center: layout ? layout.cameraUp.map(n => n * layout.framingY / layout.baseZoom) as Point : [0, 0, 0], zoom: 1 });
export const clampZoom = (zoom: number) => Math.max(1, Math.min(3, zoom));

// Layout depends on the viewport only. Selecting a court never moves an entity.
export function worldLayout(width: number, height: number) {
  const portrait = width / height < 1.1;
  const compact = portrait && height < 680;
  const cameraOffset: Point = portrait ? [3, 36, 42] : [14, 28, 32];
  const [x, y, z] = cameraOffset;
  const distance = Math.hypot(x, y, z), horizontal = Math.hypot(x, z);
  const cameraUp: Point = [-y * x / (distance * horizontal), horizontal / distance, -y * z / (distance * horizontal)];
  const depthProjection = -cameraUp[2];
  // Reserve a visible strip for each compact sign, rather than drawing it over a court.
  const baseZoom = Math.min(width / (portrait ? 18.8 : 32), portrait ? Math.max(8, (height - 276) / (3 * 10.7 * depthProjection)) : height / 25);
  const courtSpacing = portrait ? Math.max(15, 10.7 + 44 / (baseZoom * depthProjection)) : 7.2;
  const boardHeight = Math.max(0.9, BOARD_SIZE.frameHeight / (2 * baseZoom) * cameraUp[1] + 0.16);
  const boardOffset: Point = portrait ? [0, boardHeight, -courtSpacing / 2 + boardHeight * cameraUp[1] / depthProjection] : [-0.1, boardHeight, -12.7];
  const top = (1.5 * courtSpacing * depthProjection + 0.12 * cameraUp[1]) * baseZoom + BOARD_SIZE.frameHeight / 2;
  const bottom = ((courtSpacing + 5.35) * depthProjection - 0.12 * cameraUp[1] + 2.9 * Math.abs(cameraUp[0])) * baseZoom;
  const desktopTop = ((boardOffset[0] - 7.2) * cameraUp[0] + (0.12 + boardHeight) * cameraUp[1] + boardOffset[2] * cameraUp[2]) * baseZoom + BOARD_SIZE.frameHeight / 2;
  return {
    portrait, compact, courtSpacing, cameraOffset, cameraUp, boardOffset,
    framingY: portrait ? (top - bottom) / 2 - 8 : Math.max(0, 64 - height / 2 + desktopTop),
    width: portrait ? 14.5 : 28,
    length: portrait ? 2 * courtSpacing + 16 : 25,
    floorCenterZ: portrait ? 0 : -1.5,
    baseZoom,
  };
}

export function courtCenter(number: number, layout: WorldLayout): Point {
  return layout.portrait ? [0, 0.12, (number - 2) * layout.courtSpacing] : [(number - 2) * 7.2, 0.12, 0];
}
export function boardCenter(number: number, layout: WorldLayout): Point {
  const center = courtCenter(number, layout);
  return center.map((n, i) => n + layout.boardOffset[i]) as Point;
}
export function slotPosition(slot: Slot, slots: Slot[]): Point {
  const side = slots.filter(s => s.sideId === slot.sideId);
  const index = side.findIndex(s => s.id === slot.id);
  return [side.length === 1 ? 0 : index === 0 ? -1.5 : 1.5, 0.06, slot.sideId === "WHITE" ? 3.15 : -3.15];
}
export function courtNavigation(number: number, layout: WorldLayout): Navigation {
  const center = courtCenter(number, layout);
  return layout.portrait ? { center, zoom: 1.7 } : { center: center.map((n, i) => n + layout.cameraUp[i] * 2) as Point, zoom: layout.baseZoom < 28 ? 1.3 : 1.5 };
}
export function constrainNavigation(nav: Navigation, layout: WorldLayout): Navigation {
  const zoom = clampZoom(nav.zoom);
  if (zoom === 1) return overview(layout);
  return { zoom, center: [Math.max(-layout.width / 2, Math.min(layout.width / 2, nav.center[0])), nav.center[1], Math.max(-layout.length / 2, Math.min(layout.length / 2, nav.center[2]))] };
}
