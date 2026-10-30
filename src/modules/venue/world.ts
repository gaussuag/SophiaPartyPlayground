import type { EventProjection, EventState, Slot, TeamId } from "../competition";

export type Point = [number, number, number];
export type WorldLayout = ReturnType<typeof worldLayout>;
export type Navigation = { center: Point; zoom: number; yaw: number; pitch: number };
export const BOARD_SIZE = { width: 112, compactWidth: 84, faceHeight: 36, frameWidth: 120, frameHeight: 40 };
export const MAX_ZOOM = 5;
export const MIN_ZOOM = 0.35;
export const MIN_PITCH = Math.PI * 32 / 180;
export const MAX_PITCH = Math.PI * 72 / 180;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
export function overview(layout?: WorldLayout, direction?: Pick<Navigation, "yaw" | "pitch">): Navigation {
  const [x, y, z] = layout?.cameraOffset ?? [3, 36, 42];
  return { center: layout ? layout.cameraUp.map(n => n * layout.framingY / layout.baseZoom) as Point : [0, 0, 0], zoom: 1,
    yaw: direction?.yaw ?? Math.atan2(x, z), pitch: direction?.pitch ?? Math.atan2(y, Math.hypot(x, z)) };
}

// Framing is an explicit action. Pure orbit never changes the physical zoom.
export function cameraView(nav: Navigation, layout: WorldLayout) {
  const extent = (yaw: number, pitch: number) => [
    Math.abs(Math.cos(yaw)) * layout.width + Math.abs(Math.sin(yaw)) * layout.length,
    Math.sin(pitch) * (Math.abs(Math.sin(yaw)) * layout.width + Math.abs(Math.cos(yaw)) * layout.length) + 2.8 * Math.cos(pitch),
  ];
  const initial = overview(layout);
  const before = extent(initial.yaw, initial.pitch), after = extent(nav.yaw, nav.pitch);
  const fit = Math.min(1, before[0] / after[0], before[1] / after[1]);
  const radius = Math.hypot(...layout.cameraOffset);
  return {
    offset: [Math.sin(nav.yaw) * Math.cos(nav.pitch) * radius, Math.sin(nav.pitch) * radius, Math.cos(nav.yaw) * Math.cos(nav.pitch) * radius] as Point,
    up: [-Math.sin(nav.yaw) * Math.sin(nav.pitch), Math.cos(nav.pitch), -Math.cos(nav.yaw) * Math.sin(nav.pitch)] as Point,
    zoom: layout.baseZoom * nav.zoom,
    fit,
  };
}

export function frameOverview(layout: WorldLayout, direction: Pick<Navigation, "yaw" | "pitch">): Navigation {
  const nav = overview(layout, direction);
  return { ...nav, zoom: clampZoom(cameraView(nav, layout).fit) };
}
export function orbitNavigation(nav: Navigation, dx: number, dy: number, height: number): Navigation {
  const sensitivity = Math.PI * 2 * 0.65 / Math.max(1, height);
  return { ...nav, yaw: nav.yaw - dx * sensitivity,
    pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, nav.pitch - dy * sensitivity)) };
}

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
  const baseZoom = Math.min(width / (portrait ? 18.8 : 32), portrait ? Math.max(8, (height - (compact ? 316 : 276)) / (3 * 10.7 * depthProjection)) : height / 25);
  const courtSpacing = portrait ? Math.max(15, 10.7 + 44 / (baseZoom * depthProjection)) : 7.2;
  const boardHeight = Math.max(0.9, BOARD_SIZE.frameHeight / (2 * baseZoom) * cameraUp[1] + 0.16);
  const boardOffset: Point = portrait ? [0, boardHeight, -courtSpacing / 2 + boardHeight * cameraUp[1] / depthProjection] : [-0.1, boardHeight, -12.7];
  const top = (1.5 * courtSpacing * depthProjection + 0.12 * cameraUp[1]) * baseZoom + BOARD_SIZE.frameHeight / 2;
  const bottom = ((courtSpacing + 5.35) * depthProjection - 0.12 * cameraUp[1] + 2.9 * Math.abs(cameraUp[0])) * baseZoom;
  const desktopTop = ((boardOffset[0] - 7.2) * cameraUp[0] + (0.12 + boardHeight) * cameraUp[1] + boardOffset[2] * cameraUp[2]) * baseZoom + BOARD_SIZE.frameHeight / 2;
  return {
    portrait, compact, courtSpacing, cameraOffset, cameraUp, boardOffset,
    viewportWidth: width, viewportHeight: height,
    framingY: portrait ? (top - bottom) / 2 - (compact ? 32 : 8) : Math.max(0, 64 - height / 2 + desktopTop),
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
export function benchMarkerPosition(side: TeamId, layout: WorldLayout): Point {
  return layout.portrait ? [side === "WHITE" ? -5.4 : 5.4, 0.1, -layout.courtSpacing * 1.45] : [0, 0.1, side === "WHITE" ? 10.3 : -10.3];
}
export function isBenchPoint(point: Point, side: TeamId, layout: WorldLayout): boolean {
  const marker = benchMarkerPosition(side, layout);
  if (Math.hypot(point[0] - marker[0], point[2] - marker[2]) < 1.8) return true;
  return layout.portrait
    ? Math.abs(point[0] - (side === "WHITE" ? -5.4 : 5.4)) <= 1.3 && Math.abs(point[2]) <= layout.length / 2 - 0.2
    : Math.abs(point[2] - (side === "WHITE" ? 8.4 : -8.4)) <= 1.4 && Math.abs(point[0]) <= layout.width / 2 - 0.2;
}

/** The viewed round's authoritative lineup is also the post-result tableau. */
export function playerPlacement(state: EventState, view: EventProjection, playerId: string, layout: WorldLayout) {
  const player = state.players.find(p => p.id === playerId)!;
  const match = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants).some(p => p.playerId === playerId));
  let position: Point;
  if (match) {
    const slotId = match.phase === "PLANNING" ? match.draftSlots.find(s => s.playerId === playerId)!.id : match.participants.find(p => p.playerId === playerId)!.slotId;
    const point = slotPosition(match.draftSlots.find(s => s.id === slotId)!, match.draftSlots);
    const center = courtCenter(state.courts.find(c => c.id === match.courtId)!.number, layout);
    position = center.map((n, i) => n + point[i]) as Point;
  } else {
    const teamIndex = state.players.filter(p => p.teamId === player.teamId).findIndex(p => p.id === playerId);
    position = layout.portrait ? [player.teamId === "WHITE" ? -5.4 : 5.4, 0.07, (teamIndex - 3) * layout.courtSpacing / 3]
      : [(teamIndex - 3) * 3.6, 0.07, player.teamId === "WHITE" ? 8.4 : -8.4];
  }
  const facing = match || !layout.portrait ? player.teamId === "WHITE" ? Math.PI : 0 : player.teamId === "WHITE" ? Math.PI / 2 : -Math.PI / 2;
  return { position, facing, onCourt: !!match };
}
export function courtNavigation(number: number, layout: WorldLayout, current = overview(layout)): Navigation {
  const court = courtCenter(number, layout);
  const view = cameraView(current, layout);
  const right: Point = [Math.cos(current.yaw), 0, -Math.sin(current.yaw)];
  const dot = (a: Point, b: Point) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const corners: Point[] = [[-2.9, 0, -5.35], [2.9, 0, -5.35], [2.9, 0, 5.35], [-2.9, 0, 5.35]];
  const xs = corners.map(p => dot(p, right)), ys = corners.map(p => dot(p, view.up));
  const boardX = dot(layout.boardOffset, right), boardY = dot(layout.boardOffset, view.up);
  const spanX = Math.max(...xs, boardX) - Math.min(...xs, boardX), spanY = Math.max(...ys, boardY) - Math.min(...ys, boardY);
  const top = layout.viewportHeight < 500 ? 60 : 124, bottom = layout.viewportHeight < 500 ? 68 : 112;
  const width = layout.viewportWidth - 32, height = layout.viewportHeight - top - bottom;
  const desired = layout.baseZoom * (layout.portrait ? 1.7 : layout.baseZoom < 28 ? 1.3 : 1.5);
  const halfWidth = BOARD_SIZE.frameWidth * 1.3 / 2, halfHeight = BOARD_SIZE.frameHeight * 1.3 / 2;
  const scale = Math.min(desired, Math.max(1, width - 2 * halfWidth) / spanX, Math.max(1, height - 2 * halfHeight) / spanY);
  const zoom = clampZoom(scale / layout.baseZoom), physicalZoom = layout.baseZoom * zoom;
  const x = (Math.min(...xs, boardX - halfWidth / physicalZoom) + Math.max(...xs, boardX + halfWidth / physicalZoom)) / 2;
  const y = (Math.min(...ys, boardY - halfHeight / physicalZoom) + Math.max(...ys, boardY + halfHeight / physicalZoom)) / 2 + (top - bottom) / (2 * physicalZoom);
  return { ...current, center: court.map((n, i) => n + right[i] * x + view.up[i] * y) as Point, zoom };
}
export function constrainNavigation(nav: Navigation, layout: WorldLayout): Navigation {
  const zoom = clampZoom(nav.zoom);
  const direction = { yaw: Math.atan2(Math.sin(nav.yaw), Math.cos(nav.yaw)), pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, nav.pitch)) };
  return { ...direction, zoom, center: [Math.max(-layout.width / 2, Math.min(layout.width / 2, nav.center[0])), nav.center[1], Math.max(-layout.length / 2, Math.min(layout.length / 2, nav.center[2]))] };
}
