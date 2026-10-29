import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, SphereGeometry, Vector3, type OrthographicCamera } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MatchView, Player, Slot, TeamId } from "../competition";
import type { VenueProps } from "./model";

export type Anchors = Map<string, Group>;
export type Elements = Map<string, HTMLDivElement>;
export type Point = [number, number, number];
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

function courtCenter(number: number, portrait: boolean, focused: boolean, compact: boolean): Point {
  return focused ? [0, 0.12, 0] : portrait ? [0, 0.12, (number - 2) * (compact ? 13 : 15)] : [(number - 2) * 7.2, 0.12, 0];
}
function slotPosition(slot: Slot, slots: Slot[]): Point {
  const side = slots.filter(s => s.sideId === slot.sideId);
  const index = side.findIndex(s => s.id === slot.id);
  return [side.length === 1 ? 0 : index === 0 ? -1.5 : 1.5, 0.06, slot.sideId === "WHITE" ? 3.15 : -3.15];
}

function Rig({ focused, portrait }: { focused: boolean; portrait: boolean }) {
  const { size, invalidate } = useThree();
  const target = useRef({ position: new Vector3(3, 36, 42), zoom: 15 });
  useEffect(() => {
    target.current = {
      position: new Vector3(...(portrait ? focused ? [2, 45, 32] : [3, 36, 42] : [14, 28, 32]) as Point),
      zoom: Math.min(size.width / (portrait ? focused ? 10.9 : 18.8 : focused ? 17 : 32), size.height / (portrait ? focused ? 22 : 36 : focused ? 19 : 25)),
    };
    invalidate();
  }, [focused, portrait, size, invalidate]);
  useFrame(({ camera }, delta) => {
    const c = camera as OrthographicCamera;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const factor = reduced ? 1 : Math.min(1, delta * 10);
    c.position.lerp(target.current.position, factor);
    c.zoom += (target.current.zoom - c.zoom) * factor;
    c.lookAt(0, 0, 0); c.updateProjectionMatrix();
    if (c.position.distanceToSquared(target.current.position) > 0.0001 || Math.abs(c.zoom - target.current.zoom) > 0.001) invalidate();
  });
  return null;
}

function Avatar({ player, index, position, selected, muted, anchors, begin }: {
  player: Player; index: number; position: Point; selected: boolean; muted: boolean; anchors: Anchors;
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
    <group position={[0, 1.8, 0]} ref={refFor(anchors, `player:${player.id}`)} />
  </group>;
}

function Court({ number, match, position, props, anchors, hovered }: { number: number; match?: MatchView; position: Point; props: VenueProps; anchors: Anchors; hovered: string | null }) {
  const inactive = !match;
  const selected = props.courtId === props.state.courts.find(c => c.number === number)!.id;
  return <group position={position} onClick={e => { e.stopPropagation(); props.onIntent({ type: "court", courtId: props.state.courts.find(c => c.number === number)!.id }); }}>
    <mesh position={[0, -0.12, 0]}><boxGeometry args={[5.8, 0.22, 10.7]} /><meshStandardMaterial color={inactive ? "#a9bc91" : selected ? "#3b866b" : "#36765e"} roughness={1} /></mesh>
    <mesh geometry={kitchen}><meshStandardMaterial color={inactive ? "#c7d0a4" : "#afc780"} /></mesh>
    <mesh geometry={courtLines}><meshBasicMaterial color="#f3f4d9" /></mesh>
    <mesh geometry={netPosts}><meshStandardMaterial color="#294b37" /></mesh>
    <mesh position={[0, 0.49, 0]}><boxGeometry args={[5.55, 0.7, 0.035]} /><meshStandardMaterial color="#263e31" transparent opacity={0.6} /></mesh>
    <mesh position={[0, 0.86, 0]}><boxGeometry args={[5.65, 0.04, 0.065]} /><meshBasicMaterial color="#fffbe5" /></mesh>
    <group position={[0, 1, -5.9]} ref={refFor(anchors, `court:${props.state.courts.find(c => c.number === number)!.id}`)} />
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

export function Scene({ props, anchors, begin, dragging, dragPoint, hovered }: {
  props: VenueProps; anchors: Anchors; begin: (id: string, event: PointerEvent) => void;
  dragging: boolean; dragPoint: MutableRefObject<Point | null>; hovered: string | null;
}) {
  const { state, view, courtId } = props;
  const size = useThree(s => s.size);
  const portrait = size.width / size.height < 1.1;
  const compact = portrait && size.height < 680;
  const focused = !!courtId;
  const floorWidth = portrait ? focused ? 9.8 : 14.5 : focused ? 13 : 28;
  const floorLength = portrait ? focused ? 21 : compact ? 42 : 48 : focused ? 19 : 22;
  const courtPositions = state.courts.map(c => ({ court: c, position: courtCenter(c.number, portrait, focused, compact) }));
  const walkways = useMemo(() => mergeGeometries((portrait ? [-1, 1].map(s => new BoxGeometry(focused ? 1.7 : 2.5, 0.03, floorLength - 0.5).translate(s * (focused ? 3.85 : 5.4), 0, 0)) : [-1, 1].map(s => new BoxGeometry(floorWidth - 0.4, 0.03, 2.6).translate(0, 0, s * 8.4)))), [portrait, focused, floorLength, floorWidth]);
  useEffect(() => () => walkways.dispose(), [walkways]);
  return <>
    <Rig focused={focused} portrait={portrait} />
    <mesh position={[0, -0.58, 0]}><boxGeometry args={[floorWidth, 1, floorLength]} /><meshStandardMaterial color="#879b70" /></mesh>
    <mesh position={[0, -0.03, 0]}><boxGeometry args={[floorWidth - 0.16, 0.12, floorLength - 0.16]} /><meshStandardMaterial color="#acc38d" /></mesh>
    <mesh geometry={walkways} position={[0, 0.04, 0]}><meshStandardMaterial color="#e0d2ae" roughness={1} /></mesh>
    {courtPositions.filter(c => !courtId || c.court.id === courtId).map(({ court, position }) => <Court key={court.id} number={court.number} position={position} match={view.matches.find(m => m.courtId === court.id)} props={props} anchors={anchors} hovered={hovered} />)}
    {state.players.map((p, index) => {
      const occupied = view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants.map(p => ({ playerId: p.playerId }))).some(s => s.playerId === p.id));
      const present = occupied && (occupied.phase === "PLANNING" || occupied.phase === "PLAYING" || courtId === occupied.courtId);
      const teamIndex = state.players.filter(x => x.teamId === p.teamId).findIndex(x => x.id === p.id);
      let position: Point;
      if (present && (!courtId || courtId === occupied.courtId)) {
        const slots = occupied.draftSlots;
        const id = occupied.phase === "PLANNING" ? slots.find(s => s.playerId === p.id)?.id : occupied.participants.find(s => s.playerId === p.id)?.slotId;
        const slot = slots.find(s => s.id === id)!;
        const center = courtPositions.find(c => c.court.id === occupied.courtId)!.position;
        const point = slotPosition(slot, slots);
        position = [center[0] + point[0], center[1] + point[1], center[2] + point[2]];
      } else if (portrait) position = [p.teamId === "WHITE" ? -(focused ? 3.85 : 5.4) : focused ? 3.85 : 5.4, 0.07, (teamIndex - 3) * (focused ? compact ? 2.1 : 2.7 : compact ? 4.5 : 5.1)];
      else position = [(teamIndex - 3) * (focused ? 1.9 : 3.6), 0.07, p.teamId === "WHITE" ? 8.4 : -8.4];
      const unavailable = view.playerStates[p.id].status !== "available" && view.playerStates[p.id].status !== "reserved";
      const chosenSlot = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
      const mismatch = !!chosenSlot && (p.teamId !== chosenSlot.sideId || !!chosenSlot.gender && p.gender !== chosenSlot.gender);
      return <Avatar key={p.id} player={p} index={index} position={position} selected={props.selection?.playerId === p.id} muted={unavailable && !props.editingMatchId || mismatch} anchors={anchors} begin={begin} />;
    })}
    {(["WHITE", "BLACK"] as TeamId[]).map(side => <group key={side} position={portrait ? [side === "WHITE" ? -(focused ? 3.85 : 5.4) : focused ? 3.85 : 5.4, 0.1, focused ? compact ? -8.5 : -10.2 : compact ? -19.5 : -22] : [0, 0.1, side === "WHITE" ? 10.3 : -10.3]} ref={refFor(anchors, `bench:${side}`)} />)}
    {!focused && [-1, 1].map(n => <group key={n} position={[n * (floorWidth / 2 - 0.8), 0.4, n * (floorLength / 2 - 1.1)]}><mesh><boxGeometry args={[0.35, 0.9, 0.35]} /><meshStandardMaterial color="#9b8156" /></mesh><mesh position={[0, 1.1, 0]}><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial color="#6b8e56" /></mesh></group>)}
    {dragging && <DragGhost point={dragPoint} />}
  </>;
}

export function LabelProjection({ anchors, elements }: { anchors: Anchors; elements: Elements }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    for (const [id, node] of anchors) {
      const element = elements.get(id); if (!element) continue;
      node.updateWorldMatrix(true, false); node.getWorldPosition(point).project(camera);
      element.style.transform = `translate(${point.x * size.width / 2 + size.width / 2}px,${-point.y * size.height / 2 + size.height / 2}px) translate(-50%,-50%)`;
      element.style.visibility = Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1 || Math.abs(point.z) > 1 ? "hidden" : "visible";
    }
  });
  return null;
}

export function SceneMetrics({ target }: { target: { current: HTMLOutputElement | null } }) {
  useFrame(({ gl }) => { queueMicrotask(() => { if (target.current) { target.current.dataset.drawCalls = String(gl.info.render.calls); target.current.dataset.triangles = String(gl.info.render.triangles); } }); });
  return null;
}
