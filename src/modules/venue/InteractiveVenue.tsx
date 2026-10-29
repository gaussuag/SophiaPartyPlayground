"use client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { LockKeyhole, Mars, Plus, Venus } from "lucide-react";
import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";
import { LabelProjection, Scene, SceneMetrics, slotKey, type Anchors, type Elements, type Point } from "./Scene";
import type { SelectionBasis, VenueProps } from "./model";

type Gesture = { playerId: string; pointerId: number; x: number; y: number; moved: boolean; basis: SelectionBasis };
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ContextRecovery({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const canvas = useThree(s => s.gl.domElement);
  useEffect(() => {
    const lost = (e: Event) => { e.preventDefault(); onLost(); };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => { canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", onRestored); };
  }, [canvas, onLost, onRestored]);
  return null;
}

export function Venue(props: VenueProps) {
  const root = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera | null>(null);
  const invalidate = useRef<(() => void) | null>(null);
  const anchors = useMemo<Anchors>(() => new Map(), []);
  const elements = useMemo<Elements>(() => new Map(), []);
  const metrics = useRef<HTMLOutputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragPoint = useRef<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [lost, setLost] = useState(false);
  const ray = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), 0.1), []);

  function projectPointer(clientX: number, clientY: number): Point | null {
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds || !camera.current) return null;
    ray.setFromCamera(new Vector2((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1), camera.current);
    const point = ray.ray.intersectPlane(ground, new Vector3());
    return point ? [point.x, 0.1, point.z] : null;
  }
  function nearest(point: Point) {
    const location = new Vector3(...point);
    let found: { matchId: string; slotId: string; key: string; distance: number } | null = null;
    for (const target of props.placements) {
      const key = slotKey(target.matchId, target.slotId);
      const anchor = anchors.get(key); if (!anchor) continue;
      const destination = anchor.getWorldPosition(new Vector3());
      const distance = Math.hypot(location.x - destination.x, location.z - destination.z);
      if (distance < 2.1 && (!found || distance < found.distance)) found = { matchId: target.matchId, slotId: target.slotId, key, distance };
    }
    return found;
  }
  function begin(playerId: string, event: PointerEvent) {
    if (event.button !== 0 || gesture.current) return;
    gesture.current = { playerId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, basis: { revision: props.state.revision, generation: props.state.generation } };
    root.current?.setPointerCapture(event.pointerId);
  }
  function cancel() { gesture.current = null; dragPoint.current = null; setDragging(false); setHovered(null); invalidate.current?.(); }
  function finish(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = projectPointer(event.clientX, event.clientY);
    const target = point ? nearest(point) : null;
    if (!current.moved) props.onIntent({ type: "player", playerId: current.playerId });
    else if (props.editable && target) props.onIntent({ type: "place", playerId: current.playerId, matchId: target.matchId, slotId: target.slotId, basis: current.basis });
    cancel();
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
  }

  const labels: { key: string; className?: string; content: ReactNode }[] = props.state.courts.filter(c => !props.courtId || c.id === props.courtId).map(c => {
    const match = props.view.matches.find(m => m.courtId === c.id);
    const board = !!match && match.phase !== "PLANNING";
    return { key: `court:${c.id}`, content: <button className={`game-court-marker ${props.courtId === c.id ? "focused" : ""}`} aria-label={board ? `打开 ${c.number} 号场记分牌` : `进入 ${c.number} 号场`} onClick={() => props.onIntent(board ? { type: "scoreboard", matchId: match.id } : { type: "court", courtId: c.id })}><b>{String(c.number).padStart(2, "0")}</b><span>{match?.label ?? "休息区"}</span>{match?.result ? <strong>{match.result.whiteScore} : {match.result.blackScore}</strong> : board ? <i className={`court-state ${match.phase.toLowerCase()}`} /> : null}</button> };
  });
  for (const player of props.state.players) {
    const status = props.view.playerStates[player.id];
    const occupied = props.view.matches.find(m => (m.phase === "PLANNING" ? m.draftSlots : m.participants).some(p => p.playerId === player.id));
    const onCourt = occupied && (occupied.phase === "PLANNING" || occupied.phase === "PLAYING");
    const selected = props.selection?.playerId === player.id;
    const target = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
    const mismatch = !!target && (target.sideId !== player.teamId || !!target.gender && target.gender !== player.gender);
    const locked = status.status === "playing" || status.status === "played_this_round";
    labels.push({
      key: `player:${player.id}`,
      className: !props.courtId && onCourt && !selected ? "assigned-overview" : "",
      content: <button className={`game-player-label ${player.teamId.toLowerCase()} ${selected ? "selected" : ""} ${locked || mismatch ? "unavailable" : ""}`} data-player-id={player.id} aria-pressed={selected} aria-label={`选择角色 ${player.name} ${player.id}${locked ? `，${status.label}` : ""}`} onClick={e => { if (e.detail === 0) props.onIntent({ type: "player", playerId: player.id }); }}><span>{player.name}</span>{locked && <LockKeyhole size={9} aria-hidden="true" />}</button>,
    });
  }
  for (const target of props.placements.filter(t => !props.courtId || props.courtId === t.courtId)) {
    const selected = props.slotSelection?.matchId === target.matchId && props.slotSelection.slotId === target.slotId;
    if (target.occupantId && !props.selection && !selected) continue;
    const court = props.state.courts.find(c => c.id === target.courtId)!;
    const person = props.selection && props.state.players.find(p => p.id === props.selection!.playerId);
    const label = person ? `安排 ${person.name} 到 ${court.number} 号场 ${target.slotId}` : `${court.number} 号场 ${target.sideId === "WHITE" ? "白队" : "黑队"}${target.gender === "MALE" ? "男性" : target.gender === "FEMALE" ? "女性" : "自由"}位置 ${target.slotId}`;
    labels.push({ key: slotKey(target.matchId, target.slotId), className: "slot-anchor", content: <button className={`game-position ${target.allowed ? "allowed" : ""} ${selected || hovered === slotKey(target.matchId, target.slotId) ? "selected" : ""} ${target.occupantId ? "occupied" : ""} ${props.selection && !target.allowed ? "not-allowed" : ""}`} aria-label={label} disabled={!props.editable} onClick={() => props.onIntent({ type: "slot", matchId: target.matchId, slotId: target.slotId })}>{props.selection || !target.gender ? <Plus size={18} /> : target.gender === "MALE" ? <Mars size={17} /> : <Venus size={17} />}</button> });
  }
  for (const side of ["WHITE", "BLACK"] as const) labels.push({ key: `bench:${side}`, content: <span className={`game-bench-marker ${side.toLowerCase()}`}><i />{side === "WHITE" ? "白队" : "黑队"}</span> });

  const fallback = <div className="scene-fallback"><p>球馆暂时无法显示</p><button className="button secondary" onClick={() => { setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>;
  return <div ref={root} className={`venue game-venue ${props.courtId ? "focus" : "overview"} ${dragging ? "dragging" : ""}`} aria-label="三维球馆，点选球友和场内位置" onContextMenu={e => e.preventDefault()}
    onPointerDownCapture={e => { const player = (e.target as HTMLElement).closest?.<HTMLElement>("[data-player-id]"); if (player?.dataset.playerId) begin(player.dataset.playerId, e.nativeEvent); }}
    onPointerMove={e => {
      const current = gesture.current; if (!current || current.pointerId !== e.pointerId) return;
      if (!current.moved && Math.hypot(e.clientX - current.x, e.clientY - current.y) > 9) {
        current.moved = true;
        if (props.editable) { setDragging(true); props.onIntent({ type: "player", playerId: current.playerId, dragging: true }); }
      }
      if (!current.moved || !props.editable) return;
      const point = projectPointer(e.clientX, e.clientY); if (!point) return;
      dragPoint.current = point; setHovered(nearest(point)?.key ?? null); invalidate.current?.();
    }} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}>
    <SceneBoundary key={sceneRevision} fallback={fallback}>
      {lost && <div className="context-notice" role="status"><span>场景恢复中</span><button className="button secondary" onClick={() => { cancel(); setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>}
      <Canvas orthographic camera={{ position: [3, 36, 42], near: 0.1, far: 180, zoom: 18 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} onCreated={s => {
        camera.current = s.camera; invalidate.current = s.invalidate;
        setLost(false);
      }} fallback={<span>三维球馆画布</span>}>
        <ambientLight intensity={1.65} /><directionalLight position={[6, 15, 10]} intensity={2.2} color="#fff1d2" /><directionalLight position={[-10, 5, -7]} intensity={0.5} color="#c7e4da" />
        <ContextRecovery onLost={() => { cancel(); setLost(true); }} onRestored={() => { setLost(false); setSceneRevision(n => n + 1); }} />
        <Scene props={props} anchors={anchors} begin={begin} dragging={dragging} dragPoint={dragPoint} hovered={hovered} />
        <LabelProjection anchors={anchors} elements={elements} /><SceneMetrics target={metrics} />
      </Canvas>
      <div className="projected-labels">{labels.map(label => <div className={`projected-label ${label.className ?? ""}`} key={label.key} ref={node => { if (node) elements.set(label.key, node); else elements.delete(label.key); }}>{label.content}</div>)}</div>
      <output hidden aria-hidden="true" data-venue-metrics ref={metrics} />
    </SceneBoundary>
  </div>;
}
