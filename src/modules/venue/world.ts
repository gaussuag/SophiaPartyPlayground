import type { EventProjection, EventState, Slot, RosterTeamId, TeamId } from "../competition";

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
  const compact = portrait;
  const cameraOffset: Point = portrait ? [3, 36, 42] : [14, 28, 32];
  const [x, y, z] = cameraOffset;
  const distance = Math.hypot(x, y, z), horizontal = Math.hypot(x, z);
  const cameraUp: Point = [-y * x / (distance * horizontal), horizontal / distance, -y * z / (distance * horizontal)];
  // All viewports share one horizontal world. The camera fits the courts and
  // roster; peripheral landscaping can extend to the edges of a narrow screen.
  const baseZoom = Math.min((width - 24) / (portrait ? 26 : 36), height / 30);
  const courtSpacing = 8.6;
  const boardHeight = Math.max(0.9, BOARD_SIZE.frameHeight / (2 * baseZoom) * cameraUp[1] + 0.16);
  const boardOffset: Point = [-0.1, boardHeight, -14.4];
  const signTop = ((boardOffset[0] - courtSpacing) * cameraUp[0] + (0.12 + boardHeight) * cameraUp[1] + boardOffset[2] * cameraUp[2]) * baseZoom + BOARD_SIZE.frameHeight / 2;
  return {
    portrait, compact, courtSpacing, cameraOffset, cameraUp, boardOffset,
    viewportWidth: width, viewportHeight: height,
    // Reserve the header/camera strip; status lives in the bottom action stack.
    framingY: Math.max(0, 128 - height / 2 + signTop),
    width: 30,
    length: 31.4,
    floorCenterZ: -0.8,
    baseZoom,
  };
}

export function courtCenter(number: number, layout: WorldLayout): Point {
  return [(number - 2) * layout.courtSpacing, 0.12, 0];
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
export function benchMarkerPosition(side: RosterTeamId): Point {
  return side === "FREE" ? [13.7, 0.1, 0] : [0, 0.1, side === "WHITE" ? 12.6 : -10.3];
}
export function benchAreas(layout: WorldLayout): [number, number, number, number][] {
  const edge = layout.width / 2 - 1.3;
  return [[-edge, edge, 6.8, 9.3], [-edge, edge, -9.3, -6.8],
    ...[-13.15, -4.3, 4.3, 13.15].map(x => [x - .55, x + .55, -5.4, 5.4] as [number, number, number, number])];
}
export function isBenchPoint(point: Point, side: RosterTeamId, layout: WorldLayout): boolean {
  const marker = benchMarkerPosition(side);
  if (Math.hypot(point[0] - marker[0], point[2] - marker[2]) < 1.8) return true;
  return benchAreas(layout).some(([left, right, back, front]) => point[0] >= left && point[0] <= right && point[2] >= back && point[2] <= front);
}

/** The viewed round's authoritative lineup is also the post-result tableau. */
export function playerPlacement(state: EventState, view: EventProjection, playerId: string, layout: WorldLayout) {
  const player = state.players.find(p => p.id === playerId)!;
  const match = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants).some(p => p.playerId === playerId));
  let position: Point;
  let sideId: TeamId | null = null;
  if (match) {
    const slotId = match.phase === "PLANNING" ? match.draftSlots.find(s => s.playerId === playerId)!.id : match.participants.find(p => p.playerId === playerId)!.slotId;
    const slot = match.draftSlots.find(s => s.id === slotId)!;
    sideId = slot.sideId;
    const point = slotPosition(slot, match.draftSlots);
    const center = courtCenter(state.courts.find(c => c.id === match.courtId)!.number, layout);
    position = center.map((n, i) => n + point[i]) as Point;
  } else {
    const team = state.players.filter(p => p.teamId === player.teamId);
    const teamIndex = team.findIndex(p => p.id === playerId);
    position = player.teamId === "FREE" ? [13.7, 0.07, 0] : [(teamIndex - (team.length - 1) / 2) * 3.6, 0.07, player.teamId === "WHITE" ? 8.4 : -8.4];
  }
  const facing = sideId === "WHITE" || !sideId && player.teamId === "WHITE" ? Math.PI : !sideId && player.teamId === "FREE" ? -Math.PI / 2 : 0;
  return { position, facing, onCourt: !!match, sideId };
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
  const top = layout.viewportHeight < 500 ? 60 : 144;
  const bottom = layout.portrait ? Math.max(200, Math.min(300, layout.viewportHeight * 0.4) - 40) : 112;
  const width = layout.viewportWidth - 32, height = layout.viewportHeight - top - bottom;
  const desired = layout.baseZoom * (layout.portrait ? 2.8 : 1.5);
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
