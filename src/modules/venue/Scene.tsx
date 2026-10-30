import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, SphereGeometry, Vector3, type OrthographicCamera } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MatchView, TeamId } from "../competition";
import type { VenueProps } from "./model";
import { BOARD_SIZE, benchMarkerPosition, boardCenter, cameraView, courtCenter, playerPlacement, slotPosition, type Point, type WorldLayout } from "./world";
import type { CameraMotion } from "./camera-motion";
import type { CameraHud } from "./camera-hud";
import { Avatar, useAvatarAmbient } from "./Avatar";
import { AvatarResults } from "./avatar-results";
import type { VenuePerformance } from "./venue-performance";
export type { Point } from "./world";

export type Anchors = Map<string, Group>;
export type Elements = Map<string, HTMLDivElement>;
export const slotKey = (matchId: string, slotId: string) => `slot:${matchId}:${slotId}`;
const refFor = (anchors: Anchors, key: string) => (node: Group | null) => { if (node) anchors.set(key, node); else anchors.delete(key); };
const sphere = new SphereGeometry(0.24, 12, 10);
const body = mergeGeometries([
  new CapsuleGeometry(0.22, 0.32, 3, 8).translate(0, 0.66, 0),
  new CapsuleGeometry(0.075, 0.32, 2, 6).rotateZ(-0.24).translate(-0.3, 0.63, 0),
  new CapsuleGeometry(0.075, 0.32, 2, 6).rotateZ(0.24).translate(0.3, 0.63, 0),
]);
const legs = mergeGeometries([
  new CapsuleGeometry(0.08, 0.25, 2, 6).translate(-0.13, 0.23, 0),
  new CapsuleGeometry(0.08, 0.25, 2, 6).translate(0.13, 0.23, 0),
]);
const courtLines = mergeGeometries([
  ...[-2.45, 2.45].map(x => new BoxGeometry(0.05, 0.018, 9.75).translate(x, 0.03, 0)),
  ...[-4.85, -1.75, 1.75, 4.85].map(z => new BoxGeometry(4.9, 0.018, 0.05).translate(0, 0.03, z)),
  ...[-3.3, 3.3].map(z => new BoxGeometry(0.05, 0.018, 3.1).translate(0, 0.03, z)),
]);
const kitchen = mergeGeometries([-0.9, 0.9].map(z => new BoxGeometry(4.85, 0.015, 1.72).translate(0, 0.01, z)));
const netPosts = mergeGeometries([-2.8, 2.8].map(x => new CylinderGeometry(0.055, 0.065, 0.9, 6).translate(x, 0.45, 0)));

function Rig({ layout, motion, hud, timing, editor }: { layout: WorldLayout; motion: CameraMotion; hud: CameraHud; timing: VenuePerformance; editor?: { number: number; height: number; viewportHeight: number; viewportTop: number } }) {
  const { size, invalidate } = useThree();
  const look = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (editor) {
      const direction = motion.beforeEditor, view = cameraView(direction, layout), zoom = layout.baseZoom * 1.8;
      const center = boardCenter(editor.number, layout);
      const y = editor.viewportTop + 64 + (editor.viewportHeight - 80) / 2;
      motion.openEditor({ ...direction, zoom: 1.8, center: center.map((n, i) => n + view.up[i] * (y - size.height / 2) / zoom) as Point });
    } else motion.closeEditor();
    invalidate();
  }, [layout, motion, editor, size.height, invalidate]);
  useFrame(({ camera }, delta) => {
    const started = timing.enabled ? performance.now() : 0;
    const c = camera as OrthographicCamera;
    const moving = motion.step(delta, matchMedia("(prefers-reduced-motion: reduce)").matches);
    const nav = motion.value, view = cameraView(nav, layout);
    c.position.set(nav.center[0] + view.offset[0], nav.center[1] + view.offset[1], nav.center[2] + view.offset[2]);
    c.lookAt(look.set(...nav.center));
    if (c.zoom !== view.zoom) { c.zoom = view.zoom; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    hud.update(nav, layout, !!editor);
    if (timing.enabled) timing.record("camera", performance.now() - started);
    if (moving) invalidate();
  });
  return null;
}

function Scoreboard({ courtId, match, anchors, props, editorSize, layout }: { courtId: string; match?: MatchView; anchors: Anchors; props: VenueProps; editorSize: { width: number; height: number }; layout: WorldLayout }) {
  const face = useRef<Group>(null);
  const active = props.editor?.matchId === match?.id && !!match;
  useFrame(({ camera, size }) => {
    if (!face.current) return;
    const zoom = (camera as OrthographicCamera).zoom;
    face.current.quaternion.copy(camera.quaternion);
    const scale = Math.min(1.3, Math.max(1, zoom / layout.baseZoom), (size.width - 24) / BOARD_SIZE.frameWidth);
    const width = layout.compact || zoom / layout.baseZoom < 0.75 ? BOARD_SIZE.compactWidth + 8 : BOARD_SIZE.frameWidth;
    face.current.scale.set((active ? editorSize.width + 8 : width * scale) / zoom, (active ? editorSize.height + 8 : BOARD_SIZE.frameHeight * scale) / zoom, 0.12);
  });
  return <group position={layout.boardOffset}>
    <mesh position={[-1.3, -layout.boardOffset[1] / 2, 0]}><boxGeometry args={[0.1, layout.boardOffset[1], 0.1]} /><meshStandardMaterial color="#294736" /></mesh>
    <mesh position={[1.3, -layout.boardOffset[1] / 2, 0]}><boxGeometry args={[0.1, layout.boardOffset[1], 0.1]} /><meshStandardMaterial color="#294736" /></mesh>
    <group ref={face} onClick={e => { e.stopPropagation(); props.onIntent(match ? { type: "scoreboard", matchId: match.id } : { type: "court", courtId }); }}>
      <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#142f27" roughness={0.7} /></mesh>
    </group>
    <group ref={refFor(anchors, `court:${courtId}`)} />
  </group>;
}

function Court({ number, match, position, props, anchors, hovered, editorSize, layout }: { number: number; match?: MatchView; position: Point; props: VenueProps; anchors: Anchors; hovered: string | null; editorSize: { width: number; height: number }; layout: WorldLayout }) {
  const inactive = !match;
  const selected = props.courtId === props.state.courts.find(c => c.number === number)!.id;
  return <group position={position} onClick={e => { e.stopPropagation(); props.onIntent({ type: "court", courtId: props.state.courts.find(c => c.number === number)!.id }); }}>
    <mesh position={[0, -0.12, 0]}><boxGeometry args={[5.8, 0.22, 10.7]} /><meshStandardMaterial color={inactive ? "#a9bc91" : selected ? "#3b866b" : "#36765e"} roughness={1} /></mesh>
    <mesh geometry={kitchen}><meshStandardMaterial color={inactive ? "#c7d0a4" : "#afc780"} /></mesh>
    <mesh geometry={courtLines}><meshBasicMaterial color="#f3f4d9" /></mesh>
    <mesh geometry={netPosts}><meshStandardMaterial color="#294b37" /></mesh>
    <mesh position={[0, 0.49, 0]}><boxGeometry args={[5.55, 0.7, 0.035]} /><meshStandardMaterial color="#263e31" transparent opacity={0.6} /></mesh>
    <mesh position={[0, 0.86, 0]}><boxGeometry args={[5.65, 0.04, 0.065]} /><meshBasicMaterial color="#fffbe5" /></mesh>
    <Scoreboard courtId={props.state.courts.find(c => c.number === number)!.id} match={match} anchors={anchors} props={props} editorSize={editorSize} layout={layout} />
    {match?.draftSlots.map(slot => {
      const target = props.placements.find(t => t.matchId === match.id && t.slotId === slot.id);
      if (!target) return null;
      const key = slotKey(match.id, slot.id);
      const point = slotPosition(slot, match.draftSlots);
      const vacant = !target.occupantId;
      return <group key={key} position={point}>
        <group position={[0, 0.15, 0]} ref={refFor(anchors, key)} />
        {vacant && <mesh rotation={[-Math.PI / 2, 0, 0]} scale={hovered === key ? 1.35 : 1}><circleGeometry args={[0.54, 24]} /><meshBasicMaterial color={target.allowed ? "#e4fc86" : "#e1e8c1"} transparent opacity={target.allowed ? 0.65 : 0.25} depthWrite={false} /></mesh>}
      </group>;
    })}
  </group>;
}

function DragGhost({ point }: { point: MutableRefObject<Point | null> }) {
  const ref = useRef<Group>(null);
  useFrame(() => { if (ref.current && point.current) ref.current.position.set(...point.current); });
  return <group ref={ref} scale={1.55}>
    <mesh geometry={body}><meshBasicMaterial color="#e1fa8b" transparent opacity={0.72} depthWrite={false} /></mesh>
    <mesh geometry={sphere} position={[0, 1.16, 0]}><meshBasicMaterial color="#ffdeb3" transparent opacity={0.8} depthWrite={false} /></mesh>
    <mesh geometry={legs}><meshBasicMaterial color="#bed776" transparent opacity={0.7} depthWrite={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[0.36, 0.48, 24]} /><meshBasicMaterial color="#e9ff93" /></mesh>
  </group>;
}

export function Scene({ props, anchors, begin, dragging, dragPoint, hovered, layout, motion, hud, editorSize, viewport, pressedPlayerId, timing }: {
  props: VenueProps; anchors: Anchors; begin: (id: string, event: PointerEvent) => void;
  dragging: boolean; dragPoint: MutableRefObject<Point | null>; hovered: string | null;
  layout: WorldLayout; motion: CameraMotion; hud: CameraHud; editorSize: { width: number; height: number }; viewport: { height: number; top: number };
  pressedPlayerId?: string | null;
  timing: VenuePerformance;
}) {
  const { state, view } = props;
  const avatarView = props.arrangementView?.round.id === view.round.id ? props.arrangementView : view;
  const candidateKey = props.slotSelection ? `${props.slotSelection.matchId}:${props.slotSelection.slotId}` : undefined;
  const [results] = useState(() => new AvatarResults());
  const invalidate = useThree(s => s.invalidate);
  const ambient = useAvatarAmbient();
  const avatarContext = `${state.id}:${state.generation}:${view.round.id}:${layout.portrait}:${layout.courtSpacing}`;
  useEffect(() => { results.observe(state, view); invalidate(); }, [state, view, results, invalidate]);
  const { width: floorWidth, length: floorLength } = layout;
  const courtPositions = state.courts.map(c => ({ court: c, position: courtCenter(c.number, layout) }));
  const editorCourt = props.editor && state.courts.find(c => view.matches.find(m => m.id === props.editor!.matchId)?.courtId === c.id);
  const rigEditor = useMemo(() => editorCourt ? { number: editorCourt.number, height: editorSize.height, viewportHeight: viewport.height, viewportTop: viewport.top } : undefined, [editorCourt, editorSize.height, viewport.height, viewport.top]);
  const walkways = useMemo(() => mergeGeometries([-1, 1].map(s => new BoxGeometry(floorWidth - 0.4, 0.03, 2.6).translate(0, 0, s * 8.4))), [floorWidth]);
  useEffect(() => () => walkways.dispose(), [walkways]);
  return <>
    <Rig layout={layout} motion={motion} hud={hud} timing={timing} editor={rigEditor} />
    <mesh position={[0, -0.58, layout.floorCenterZ]}><boxGeometry args={[floorWidth, 1, floorLength]} /><meshStandardMaterial color="#879b70" /></mesh>
    <mesh position={[0, -0.03, layout.floorCenterZ]}><boxGeometry args={[floorWidth - 0.16, 0.12, floorLength - 0.16]} /><meshStandardMaterial color="#acc38d" /></mesh>
    <mesh geometry={walkways} position={[0, 0.04, 0]}><meshStandardMaterial color="#e0d2ae" roughness={1} /></mesh>
    {courtPositions.map(({ court, position }) => <Court key={court.id} number={court.number} position={position} match={view.matches.find(m => m.courtId === court.id)} props={props} anchors={anchors} hovered={hovered} editorSize={editorSize} layout={layout} />)}
    {state.players.map((p, index) => {
      const { position, facing, onCourt } = playerPlacement(state, avatarView, p.id, layout);
      const unavailable = view.playerStates[p.id].status !== "available" && view.playerStates[p.id].status !== "reserved";
      const chosenSlot = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
      const mismatch = !!chosenSlot && (p.teamId !== chosenSlot.sideId || !!chosenSlot.gender && p.gender !== chosenSlot.gender);
      return <Avatar key={p.id} player={p} index={index} position={position} onCourt={onCourt} selected={props.selection?.playerId === p.id || pressedPlayerId === p.id} muted={unavailable && !props.editingMatchId || mismatch} status={avatarView.playerStates[p.id].status} anchors={anchors} begin={begin} layout={layout} context={avatarContext} facing={facing} results={results} ambient={ambient} candidateKey={props.candidatePlayerIds?.includes(p.id) ? candidateKey : undefined} />;
    })}
    {(["WHITE", "BLACK"] as TeamId[]).map(side => <group key={side} position={benchMarkerPosition(side)} ref={refFor(anchors, `bench:${side}`)} />)}
    {[-1, 1].map(n => <group key={n} position={[n * (floorWidth / 2 - 0.8), 0.4, n * 9.9]}><mesh><boxGeometry args={[0.35, 0.9, 0.35]} /><meshStandardMaterial color="#9b8156" /></mesh><mesh position={[0, 1.1, 0]}><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial color="#6b8e56" /></mesh></group>)}
    {dragging && <DragGhost point={dragPoint} />}
  </>;
}

export function LabelProjection({ anchors, elements, baseZoom, timing }: { anchors: Anchors; elements: Elements; baseZoom: number; timing: VenuePerformance }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const started = timing.enabled ? performance.now() : 0;
    camera.updateMatrixWorld();
    for (const [id, node] of anchors) {
      const element = elements.get(id); if (!element) continue;
      node.updateWorldMatrix(true, false); node.getWorldPosition(point);
      if (timing.enabled && id.startsWith("player:")) {
        element.dataset.walking = String(!!node.parent?.userData.walking);
        element.dataset.inviting = String(!!node.parent?.userData.inviting);
        element.dataset.worldPosition = `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
      }
      point.project(camera);
      const scale = id.startsWith("court:") && !element.dataset.editor ? Math.min(1.3, Math.max(1, (camera as OrthographicCamera).zoom / baseZoom), (size.width - 24) / BOARD_SIZE.frameWidth) : 1;
      const transform = `translate(${(point.x * size.width / 2 + size.width / 2).toFixed(2)}px,${(-point.y * size.height / 2 + size.height / 2).toFixed(2)}px) translate(-50%,-50%) scale(${scale.toFixed(4)})`;
      if (element.style.transform !== transform) element.style.transform = transform;
      const visibility = Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1 || Math.abs(point.z) > 1 ? "hidden" : "visible";
      if (element.style.visibility !== visibility) element.style.visibility = visibility;
    }
    if (timing.enabled) timing.record("labels", performance.now() - started);
  });
  return null;
}

export function SceneMetrics({ target, motion, timing }: { target: { current: HTMLOutputElement | null }; motion: CameraMotion; timing: VenuePerformance }) {
  const gl = useThree(s => s.gl);
  useEffect(() => {
    if (!timing.enabled) return;
    const render = gl.render;
    gl.render = function (...args) {
      const started = performance.now();
      try { return render.apply(this, args); }
      finally { timing.record("renderCpu", performance.now() - started); }
    };
    return () => { gl.render = render; };
  }, [gl, timing]);
  useFrame(() => timing.frame(performance.now()), -100);
  useFrame(({ gl, camera }) => { queueMicrotask(() => { if (target.current) {
    target.current.dataset.drawCalls = String(gl.info.render.calls); target.current.dataset.triangles = String(gl.info.render.triangles);
    const navigation = motion.value;
    target.current.dataset.cameraZoom = navigation.zoom.toFixed(2); target.current.dataset.cameraYaw = navigation.yaw.toFixed(3); target.current.dataset.cameraPitch = navigation.pitch.toFixed(3);
    target.current.dataset.cameraMoving = String(motion.moving);
    target.current.dataset.renderZoom = String((camera as OrthographicCamera).zoom);
    timing.publish(target.current, performance.now());
  } }); });
  return null;
}
