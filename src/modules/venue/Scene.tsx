import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, SphereGeometry, Vector3, type OrthographicCamera } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MatchView, Player, TeamId } from "../competition";
import type { VenueProps } from "./model";
import { BOARD_OFFSET, boardCenter, courtCenter, slotPosition, type Navigation, type Point, type WorldLayout } from "./world";
export type { Point } from "./world";

export type Anchors = Map<string, Group>;
export type Elements = Map<string, HTMLDivElement>;
export const slotKey = (matchId: string, slotId: string) => `slot:${matchId}:${slotId}`;
const refFor = (anchors: Anchors, key: string) => (node: Group | null) => { if (node) anchors.set(key, node); else anchors.delete(key); };
const skin = ["#d99b77", "#f4c7a1", "#b97a56", "#e2ad88", "#eac7a5", "#ca9274", "#f4d2b3"];
const hair = ["#34302a", "#60422b", "#252b31", "#846045", "#383331", "#5b4436", "#c4955a"];
const sphere = new SphereGeometry(0.24, 12, 10);
const hairGeometry = new SphereGeometry(0.249, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
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

function Rig({ layout, navigation, editor }: { layout: WorldLayout; navigation: Navigation; editor?: { number: number; height: number; viewportHeight: number; viewportTop: number } }) {
  const { size, invalidate } = useThree();
  const target = useRef({ position: new Vector3(3, 36, 42), center: new Vector3(), zoom: 15 });
  useEffect(() => {
    const zoom = layout.baseZoom * (editor ? 1.8 : navigation.zoom);
    const center = new Vector3(...(editor ? boardCenter(editor.number, layout) : navigation.center));
    if (editor) {
      // Keep the physical scoreboard within Safari's visible area when its keyboard opens.
      const up = new Vector3(0, 1, 0).projectOnPlane(new Vector3(...layout.cameraOffset).normalize()).normalize();
      const y = editor.viewportTop + 64 + (editor.viewportHeight - 80) / 2;
      center.addScaledVector(up, -(size.height / 2 - y) / zoom);
    }
    target.current = {
      position: center.clone().add(new Vector3(...layout.cameraOffset)), center, zoom,
    };
    invalidate();
  }, [layout, navigation, editor, size.height, invalidate]);
  useFrame(({ camera }, delta) => {
    const c = camera as OrthographicCamera;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const factor = reduced ? 1 : Math.min(1, delta * 10);
    c.position.lerp(target.current.position, factor);
    c.zoom += (target.current.zoom - c.zoom) * factor;
    c.lookAt(c.position.clone().sub(new Vector3(...layout.cameraOffset))); c.updateProjectionMatrix();
    if (c.position.distanceToSquared(target.current.position) > 0.0001 || Math.abs(c.zoom - target.current.zoom) > 0.001) invalidate();
  });
  return null;
}

function Scoreboard({ courtId, match, anchors, props, editorSize, baseZoom }: { courtId: string; match?: MatchView; anchors: Anchors; props: VenueProps; editorSize: { width: number; height: number }; baseZoom: number }) {
  const face = useRef<Group>(null);
  const active = props.editor?.matchId === match?.id && !!match;
  useFrame(({ camera, size }) => {
    if (!face.current) return;
    const zoom = (camera as OrthographicCamera).zoom;
    face.current.quaternion.copy(camera.quaternion);
    const scale = Math.min(1.3, zoom / baseZoom, (size.width - 24) / 124);
    face.current.scale.set((active ? editorSize.width + 8 : 124 * scale) / zoom, (active ? editorSize.height + 8 : (match?.result ? 88 : 70) * scale) / zoom, 0.12);
  });
  return <group position={BOARD_OFFSET}>
    <mesh position={[-1.5, -0.72, 0]}><boxGeometry args={[0.12, 1.5, 0.12]} /><meshStandardMaterial color="#294736" /></mesh>
    <mesh position={[1.5, -0.72, 0]}><boxGeometry args={[0.12, 1.5, 0.12]} /><meshStandardMaterial color="#294736" /></mesh>
    <group ref={face} onClick={e => { e.stopPropagation(); props.onIntent(match ? { type: "scoreboard", matchId: match.id } : { type: "court", courtId }); }}>
      <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#142f27" roughness={0.7} /></mesh>
    </group>
    <group ref={refFor(anchors, `court:${courtId}`)} />
  </group>;
}

function Avatar({ player, index, position, selected, muted, onCourt, anchors, begin }: {
  player: Player; index: number; position: Point; selected: boolean; muted: boolean; onCourt: boolean; anchors: Anchors;
  begin: (playerId: string, event: PointerEvent) => void;
}) {
  const group = useRef<Group>(null);
  const [initial] = useState(position);
  const invalidate = useThree(s => s.invalidate);
  const [x, y, z] = position;
  const target = useMemo(() => new Vector3(x, y, z), [x, y, z]);
  useEffect(() => invalidate(), [target, invalidate]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const remaining = group.current.position.distanceToSquared(target);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) group.current.position.copy(target);
    else if (remaining > 0.0001) { group.current.position.lerp(target, Math.min(1, delta * 9)); invalidate(); }
  });
  return <group ref={group} position={initial} scale={1.55} onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); begin(player.id, e.nativeEvent); }}>
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[0.35, 0.47, 24]} /><meshBasicMaterial color="#e4fc86" /></mesh>}
    <mesh geometry={body}><meshStandardMaterial color={player.teamId === "WHITE" ? muted ? "#d8dac6" : "#fff8de" : muted ? "#546751" : "#233d33"} roughness={0.9} /></mesh>
    <mesh geometry={legs}><meshStandardMaterial color={player.teamId === "WHITE" ? "#8f9b7c" : "#1e302a"} /></mesh>
    <mesh geometry={sphere} position={[0, 1.16, 0]}><meshStandardMaterial color={skin[index % 7]} /></mesh>
    <mesh geometry={hairGeometry} position={[0, 1.2, 0]} rotation={[0, index * 0.7, index % 3 === 0 ? 0.18 : 0]}><meshStandardMaterial color={hair[index % 7]} /></mesh>
    <mesh position={[0, 0.8, 0]} visible={false}><boxGeometry args={[1, 1.8, 0.8]} /><meshBasicMaterial /></mesh>
    <group position={onCourt ? [0, -0.1, 0] : [0, 1.8, 0]} ref={refFor(anchors, `player:${player.id}`)} />
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
    <Scoreboard courtId={props.state.courts.find(c => c.number === number)!.id} match={match} anchors={anchors} props={props} editorSize={editorSize} baseZoom={layout.baseZoom} />
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

export function Scene({ props, anchors, begin, dragging, dragPoint, hovered, layout, navigation, editorSize, viewport }: {
  props: VenueProps; anchors: Anchors; begin: (id: string, event: PointerEvent) => void;
  dragging: boolean; dragPoint: MutableRefObject<Point | null>; hovered: string | null;
  layout: WorldLayout; navigation: Navigation; editorSize: { width: number; height: number }; viewport: { height: number; top: number };
}) {
  const { state, view } = props;
  const { portrait, compact, width: floorWidth, length: floorLength } = layout;
  const courtPositions = state.courts.map(c => ({ court: c, position: courtCenter(c.number, layout) }));
  const editorCourt = props.editor && state.courts.find(c => view.matches.find(m => m.id === props.editor!.matchId)?.courtId === c.id);
  const rigEditor = useMemo(() => editorCourt ? { number: editorCourt.number, height: editorSize.height, viewportHeight: viewport.height, viewportTop: viewport.top } : undefined, [editorCourt, editorSize.height, viewport.height, viewport.top]);
  const walkways = useMemo(() => mergeGeometries((portrait ? [-1, 1].map(s => new BoxGeometry(2.5, 0.03, floorLength - 0.5).translate(s * 5.4, 0, 0)) : [-1, 1].map(s => new BoxGeometry(floorWidth - 0.4, 0.03, 2.6).translate(0, 0, s * 8.4)))), [portrait, floorLength, floorWidth]);
  useEffect(() => () => walkways.dispose(), [walkways]);
  return <>
    <Rig layout={layout} navigation={navigation} editor={rigEditor} />
    <mesh position={[0, -0.58, 0]}><boxGeometry args={[floorWidth, 1, floorLength]} /><meshStandardMaterial color="#879b70" /></mesh>
    <mesh position={[0, -0.03, 0]}><boxGeometry args={[floorWidth - 0.16, 0.12, floorLength - 0.16]} /><meshStandardMaterial color="#acc38d" /></mesh>
    <mesh geometry={walkways} position={[0, 0.04, 0]}><meshStandardMaterial color="#e0d2ae" roughness={1} /></mesh>
    {courtPositions.map(({ court, position }) => <Court key={court.id} number={court.number} position={position} match={view.matches.find(m => m.courtId === court.id)} props={props} anchors={anchors} hovered={hovered} editorSize={editorSize} layout={layout} />)}
    {state.players.map((p, index) => {
      const occupied = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants.map(p => ({ playerId: p.playerId }))).some(s => s.playerId === p.id));
      const present = occupied;
      const teamIndex = state.players.filter(x => x.teamId === p.teamId).findIndex(x => x.id === p.id);
      let position: Point;
      if (present) {
        const slots = occupied.draftSlots;
        const id = occupied.phase === "PLANNING" ? slots.find(s => s.playerId === p.id)?.id : occupied.participants.find(s => s.playerId === p.id)?.slotId;
        const slot = slots.find(s => s.id === id)!;
        const center = courtPositions.find(c => c.court.id === occupied.courtId)!.position;
        const point = slotPosition(slot, slots);
        position = [center[0] + point[0], center[1] + point[1], center[2] + point[2]];
      } else if (portrait) position = [p.teamId === "WHITE" ? -5.4 : 5.4, 0.07, (teamIndex - 3) * (compact ? 4.5 : 5.1)];
      else position = [(teamIndex - 3) * 3.6, 0.07, p.teamId === "WHITE" ? 8.4 : -8.4];
      const unavailable = view.playerStates[p.id].status !== "available" && view.playerStates[p.id].status !== "reserved";
      const chosenSlot = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
      const mismatch = !!chosenSlot && (p.teamId !== chosenSlot.sideId || !!chosenSlot.gender && p.gender !== chosenSlot.gender);
      return <Avatar key={p.id} player={p} index={index} position={position} onCourt={!!present} selected={props.selection?.playerId === p.id} muted={unavailable && !props.editingMatchId || mismatch} anchors={anchors} begin={begin} />;
    })}
    {(["WHITE", "BLACK"] as TeamId[]).map(side => <group key={side} position={portrait ? [side === "WHITE" ? -5.4 : 5.4, 0.1, compact ? -19.5 : -22] : [0, 0.1, side === "WHITE" ? 10.3 : -10.3]} ref={refFor(anchors, `bench:${side}`)} />)}
    {[-1, 1].map(n => <group key={n} position={[n * (floorWidth / 2 - 0.8), 0.4, n * (floorLength / 2 - 1.1)]}><mesh><boxGeometry args={[0.35, 0.9, 0.35]} /><meshStandardMaterial color="#9b8156" /></mesh><mesh position={[0, 1.1, 0]}><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial color="#6b8e56" /></mesh></group>)}
    {dragging && <DragGhost point={dragPoint} />}
  </>;
}

export function LabelProjection({ anchors, elements, baseZoom }: { anchors: Anchors; elements: Elements; baseZoom: number }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    for (const [id, node] of anchors) {
      const element = elements.get(id); if (!element) continue;
      node.updateWorldMatrix(true, false); node.getWorldPosition(point).project(camera);
      const scale = id.startsWith("court:") && !element.dataset.editor ? Math.min(1.3, (camera as OrthographicCamera).zoom / baseZoom, (size.width - 24) / 124) : 1;
      element.style.transform = `translate(${point.x * size.width / 2 + size.width / 2}px,${-point.y * size.height / 2 + size.height / 2}px) translate(-50%,-50%) scale(${scale})`;
      element.style.visibility = Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1 || Math.abs(point.z) > 1 ? "hidden" : "visible";
    }
  });
  return null;
}

export function SceneMetrics({ target }: { target: { current: HTMLOutputElement | null } }) {
  useFrame(({ gl }) => { queueMicrotask(() => { if (target.current) { target.current.dataset.drawCalls = String(gl.info.render.calls); target.current.dataset.triangles = String(gl.info.render.triangles); } }); });
  return null;
}
