"use client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArrowUpRight, Check, Compass, LockKeyhole, Mars, Minus, Pencil, Plus, Scan, Venus } from "lucide-react";
import { Plane, Raycaster, Vector2, Vector3, type OrthographicCamera } from "three";
import { LabelProjection, Scene, SceneMetrics, slotKey, type Anchors, type Elements, type Point } from "./Scene";
import { CameraMotion } from "./camera-motion";
import { CameraHud } from "./camera-hud";
import type { SelectionBasis, VenueProps } from "./model";
import { cameraView, clampZoom, constrainNavigation, courtCenter, courtNavigation, frameOverview, orbitNavigation, overview, worldLayout, type Navigation } from "./world";

type Gesture = { playerId: string; pointerId: number; x: number; y: number; moved: boolean; basis: SelectionBasis };
type ScreenPoint = { x: number; y: number };
type CameraGesture = { camera: OrthographicCamera; navigation: Navigation; start: ScreenPoint; distance?: number; moved: boolean; mode: "orbit" | "pan" };
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
  const camera = useRef<OrthographicCamera | null>(null);
  const invalidate = useRef<(() => void) | null>(null);
  const anchors = useMemo<Anchors>(() => new Map(), []);
  const elements = useMemo<Elements>(() => new Map(), []);
  const metrics = useRef<HTMLOutputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragPoint = useRef<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [orbiting, setOrbiting] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [lost, setLost] = useState(false);
  const [size, setSize] = useState({ width: 390, height: 844 });
  const layout = useMemo(() => worldLayout(size.width, size.height), [size]);
  const [viewport, setViewport] = useState({ height: 844, top: 0 });
  const [editorSize, setEditorSize] = useState({ width: 340, height: 390 });
  const [motion] = useState(() => new CameraMotion(overview(layout)));
  const [hud] = useState(() => new CameraHud(root));
  const previousView = useRef({ key: props.cameraRequest.key, layout });
  useEffect(() => {
    const previous = previousView.current;
    if (previous.key === props.cameraRequest.key && previous.layout === layout) return;
    const changed = previous.key !== props.cameraRequest.key;
    const court = changed ? props.state.courts.find(c => c.id === props.cameraRequest.courtId) : undefined;
    const current = motion.snapshot();
    motion.move(court ? courtNavigation(court.number, layout, current) : !changed && previous.layout.portrait === layout.portrait ? constrainNavigation(current, layout) : overview(layout));
    previousView.current = { key: props.cameraRequest.key, layout };
    invalidate.current?.();
  }, [layout, motion, props.cameraRequest.key, props.cameraRequest.courtId, props.state.courts]);
  const pointers = useRef(new Map<number, ScreenPoint>());
  const cameraGesture = useRef<CameraGesture | null>(null);
  const suppressClick = useRef(false);
  const ray = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), -0.1), []);

  useEffect(() => {
    const node = root.current; if (!node) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); });
    observer.observe(node);
    const update = () => setViewport({ height: window.visualViewport?.height ?? innerHeight, top: window.visualViewport?.offsetTop ?? 0 });
    update(); window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update);
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    const node = root.current?.querySelector(".world-scoreboard-editor"); if (!node) return;
    const observer = new ResizeObserver(entries => { const box = entries[0].borderBoxSize[0]; setEditorSize({ width: box.inlineSize, height: box.blockSize }); });
    observer.observe(node); return () => observer.disconnect();
  }, [props.editor?.matchId]);

  function projectPointer(clientX: number, clientY: number, from = camera.current): Point | null {
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds || !from) return null;
    ray.setFromCamera(new Vector2((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1), from);
    const point = ray.ray.intersectPlane(ground, new Vector3());
    return point ? [point.x, 0.1, point.z] : null;
  }
  function navigate(value: Navigation) {
    motion.move(constrainNavigation(value, layout), true);
    invalidate.current?.();
  }
  function freezeCamera() { motion.stop(); }
  useEffect(() => {
    pointers.current.clear(); cameraGesture.current = null;
    gesture.current = null; dragPoint.current = null;
    return () => motion.stop();
  }, [layout, motion, props.cameraRequest.key]);
  function cameraSnapshot(start: ScreenPoint, distance?: number, pan = false): CameraGesture | null {
    if (!camera.current) return null;
    const c = camera.current.clone();
    c.updateMatrixWorld();
    return { camera: c, navigation: motion.snapshot(), start, distance, moved: false, mode: distance !== undefined || pan ? "pan" : "orbit" };
  }
  function moveCamera(snapshot: CameraGesture, point: ScreenPoint, zoom: number) {
    const before = projectPointer(snapshot.start.x, snapshot.start.y, snapshot.camera);
    const next = snapshot.camera.clone(); next.zoom = cameraView({ ...snapshot.navigation, zoom: clampZoom(zoom) }, layout).zoom; next.updateProjectionMatrix();
    const after = projectPointer(point.x, point.y, next);
    if (before && after) navigate({ ...snapshot.navigation, zoom, center: snapshot.navigation.center.map((n, i) => n + before[i] - after[i]) as Point });
  }
  function zoomBy(factor: number, point?: ScreenPoint) {
    freezeCamera();
    const bounds = root.current?.getBoundingClientRect(); if (!bounds) return;
    const at = point ?? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const snapshot = cameraSnapshot(at); if (snapshot) moveCamera(snapshot, at, snapshot.navigation.zoom * factor);
  }
  useEffect(() => {
    const node = root.current; if (!node) return;
    const wheel = (e: WheelEvent) => {
      if (props.editor || (e.target as HTMLElement).closest("[data-scene-ui]")) return;
      e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  });
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
    if (event.button !== 0 || gesture.current || props.editor || pointers.current.size > 1) return;
    freezeCamera(); cameraGesture.current = null;
    gesture.current = { playerId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, basis: { revision: props.state.revision, generation: props.state.generation } };
    root.current?.setPointerCapture(event.pointerId);
  }
  function cancel() { gesture.current = null; dragPoint.current = null; setDragging(false); setHovered(null); invalidate.current?.(); }
  function finish(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const nav = cameraGesture.current;
    if (nav && (nav.distance !== undefined || nav.moved)) {
      suppressClick.current = true; cancel();
      setOrbiting(false);
      if (!pointers.current.size) {
        cameraGesture.current = null;
      } else if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        cameraGesture.current = cameraSnapshot({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)));
      }
      if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
      return;
    }
    cameraGesture.current = null;
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = projectPointer(event.clientX, event.clientY);
    const target = point ? nearest(point) : null;
    if (current.moved) suppressClick.current = true;
    if (!current.moved) props.onIntent({ type: "player", playerId: current.playerId });
    else if (props.editable && target) props.onIntent({ type: "place", playerId: current.playerId, matchId: target.matchId, slotId: target.slotId, basis: current.basis });
    cancel();
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
  }

  const labels: { key: string; className?: string; editor?: boolean; content: ReactNode }[] = props.state.courts.map(c => {
    const match = props.view.matches.find(m => m.courtId === c.id);
    if (match && props.editor?.matchId === match.id) return { key: `court:${c.id}`, className: "board-anchor editing-board", editor: true, content: props.editor.content };
    const ready = match?.phase === "PLANNING" && match.canStart && props.view.isCurrent && props.state.phase === "ACTIVE";
    const canStart = ready && !props.readOnly;
    const locked = !!props.editor || !!props.editingMatchId || !props.readOnly && !props.canWrite && (canStart || match?.phase === "PLAYING" || match?.phase === "COMPLETED");
    const action = !match ? "休息区" : match.phase === "PLANNING" ? props.readOnly ? "查看球场" : ready ? "确认上场" : "安排阵容" : match.phase === "PLAYING" ? props.readOnly ? "比赛进行中" : "录入赛果" : match.phase === "AWAITING_RESULT" ? props.readOnly ? "等待赛果" : "继续录分" : props.readOnly ? "查看赛果" : "更正比分";
    return { key: `court:${c.id}`, className: "board-anchor", content: <button data-scene-ui className={`world-scoreboard ${match?.phase.toLowerCase() ?? "rest"} ${canStart ? "ready" : ""}`} aria-label={`${c.number} 号场 · ${action}`} title={`${c.number} 号场 · ${match?.label ?? "休息区"} · ${action}`} disabled={locked} onClick={() => props.onIntent(!match || match.phase === "PLANNING" && !canStart ? { type: "court", courtId: c.id } : canStart ? { type: "start", matchId: match!.id } : { type: "scoreboard", matchId: match!.id })}>
      <span className="board-face"><b>{String(c.number).padStart(2, "0")}</b>
        {match?.result ? <strong className="board-result">{match.result.whiteScore}<i>:</i>{match.result.blackScore}</strong> : <span className="board-action">{match?.phase === "PLANNING" && !canStart ? match.label : match?.phase === "PLAYING" && props.readOnly ? "比赛中" : action}</span>}
        {canStart ? <Check size={14} aria-hidden="true" /> : match?.result && !props.readOnly ? <Pencil size={13} aria-hidden="true" /> : match ? <ArrowUpRight size={13} aria-hidden="true" /> : null}
      </span>
    </button> };
  });
  for (const player of props.state.players) {
    const status = props.view.playerStates[player.id];
    const selected = props.selection?.playerId === player.id;
    const target = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
    const mismatch = !!target && (target.sideId !== player.teamId || !!target.gender && target.gender !== player.gender);
    const locked = status.status === "playing" || status.status === "played_this_round";
    labels.push({
      key: `player:${player.id}`,
      content: <button className={`game-player-label ${player.teamId.toLowerCase()} ${selected ? "selected" : ""} ${locked || mismatch ? "unavailable" : ""}`} data-player-id={player.id} aria-pressed={selected} aria-label={`选择角色 ${player.name} ${player.id}${locked ? `，${status.label}` : ""}`} onClick={e => { if (e.detail === 0) props.onIntent({ type: "player", playerId: player.id }); }}><span>{player.name}</span>{locked && <LockKeyhole size={9} aria-hidden="true" />}</button>,
    });
  }
  for (const target of props.placements) {
    const selected = props.slotSelection?.matchId === target.matchId && props.slotSelection.slotId === target.slotId;
    if (target.occupantId && !props.selection && !selected) continue;
    const court = props.state.courts.find(c => c.id === target.courtId)!;
    const person = props.selection && props.state.players.find(p => p.id === props.selection!.playerId);
    const label = person ? `安排 ${person.name} 到 ${court.number} 号场 ${target.slotId}` : `${court.number} 号场 ${target.sideId === "WHITE" ? "白队" : "黑队"}${target.gender === "MALE" ? "男性" : target.gender === "FEMALE" ? "女性" : "自由"}位置 ${target.slotId}`;
    labels.push({ key: slotKey(target.matchId, target.slotId), className: "slot-anchor", content: <button className={`game-position ${target.allowed ? "allowed" : ""} ${selected || hovered === slotKey(target.matchId, target.slotId) ? "selected" : ""} ${target.occupantId ? "occupied" : ""} ${props.selection && !target.allowed ? "not-allowed" : ""}`} aria-label={label} disabled={!props.editable} onClick={() => props.onIntent({ type: "slot", matchId: target.matchId, slotId: target.slotId })}>{props.selection || !target.gender ? <Plus size={18} /> : target.gender === "MALE" ? <Mars size={17} /> : <Venus size={17} />}</button> });
  }
  for (const side of ["WHITE", "BLACK"] as const) labels.push({ key: `bench:${side}`, content: <span className={`game-bench-marker ${side.toLowerCase()}`}><i />{side === "WHITE" ? "白队" : "黑队"}</span> });

  const fallback = <div className="scene-fallback"><p>球馆暂时无法显示</p><button className="button secondary" onClick={() => { setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>;
  return <div ref={root} className={`venue game-venue ${dragging ? "dragging" : ""} ${orbiting ? "orbiting" : ""} ${props.editor ? "scoring" : ""}`} aria-label="三维球馆，单指旋转，双指缩放和平移，点选或拖拽球友" onContextMenu={e => e.preventDefault()}
    style={{ "--visible-height": `${viewport.height}px` } as React.CSSProperties}
    onClickCapture={e => { if (suppressClick.current && e.detail !== 0) { e.stopPropagation(); e.preventDefault(); } }}
    onPointerDownCapture={e => {
      if (props.editor || e.button !== 0) return;
      freezeCamera();
      const target = e.target as HTMLElement;
      if (!pointers.current.size) suppressClick.current = false;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size > 1) {
        cancel(); setOrbiting(false); suppressClick.current = true;
        const [a, b] = [...pointers.current.values()];
        cameraGesture.current = cameraSnapshot({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)));
        root.current?.setPointerCapture(e.pointerId); return;
      }
      if (target.closest?.("[data-scene-ui]")) return;
      const player = target.closest?.<HTMLElement>("[data-player-id]");
      if (player?.dataset.playerId) begin(player.dataset.playerId, e.nativeEvent);
      else cameraGesture.current = cameraSnapshot({ x: e.clientX, y: e.clientY }, undefined, e.shiftKey);
    }}
    onPointerMove={e => {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const nav = cameraGesture.current;
      if (nav?.distance !== undefined) {
        if (pointers.current.size < 2) return;
        const [a, b] = [...pointers.current.values()]; nav.moved = true;
        moveCamera(nav, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nav.navigation.zoom * Math.hypot(a.x - b.x, a.y - b.y) / nav.distance); return;
      }
      if (nav && !gesture.current) {
        if (!nav.moved && Math.hypot(e.clientX - nav.start.x, e.clientY - nav.start.y) > 3) { nav.moved = true; setOrbiting(nav.mode === "orbit"); root.current?.setPointerCapture(e.pointerId); }
        if (nav.moved) {
          suppressClick.current = true;
        }
        if (nav.mode === "pan") moveCamera(nav, { x: e.clientX, y: e.clientY }, nav.navigation.zoom);
        else navigate(orbitNavigation(nav.navigation, e.clientX - nav.start.x, e.clientY - nav.start.y, root.current!.clientHeight));
        return;
      }
      const current = gesture.current; if (!current || current.pointerId !== e.pointerId) return;
      if (!current.moved && Math.hypot(e.clientX - current.x, e.clientY - current.y) > 9) {
        current.moved = true;
        if (props.editable) { setDragging(true); props.onIntent({ type: "player", playerId: current.playerId, dragging: true }); }
      }
      if (!current.moved || !props.editable) return;
      const point = projectPointer(e.clientX, e.clientY); if (!point) return;
      dragPoint.current = point; setHovered(nearest(point)?.key ?? null); invalidate.current?.();
    }} onPointerUp={finish} onPointerCancel={() => { freezeCamera(); setOrbiting(false); suppressClick.current = true; pointers.current.clear(); cameraGesture.current = null; cancel(); }} onLostPointerCapture={e => { if (pointers.current.has(e.pointerId)) { freezeCamera(); setOrbiting(false); suppressClick.current = true; pointers.current.clear(); cameraGesture.current = null; cancel(); } }}>
    <SceneBoundary key={sceneRevision} fallback={fallback}>
      {lost && <div className="context-notice" role="status"><span>场景恢复中</span><button className="button secondary" onClick={() => { cancel(); setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>}
      <Canvas orthographic camera={{ position: [3, 36, 42], near: 0.1, far: 180, zoom: 18 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} onCreated={s => {
        camera.current = s.camera as OrthographicCamera; invalidate.current = s.invalidate;
        setLost(false);
      }} fallback={<span>三维球馆画布</span>}>
        <ambientLight intensity={1.65} /><directionalLight position={[6, 15, 10]} intensity={2.2} color="#fff1d2" /><directionalLight position={[-10, 5, -7]} intensity={0.5} color="#c7e4da" />
        <ContextRecovery onLost={() => { cancel(); setLost(true); }} onRestored={() => { setLost(false); setSceneRevision(n => n + 1); }} />
        <Scene props={props} anchors={anchors} begin={begin} dragging={dragging} dragPoint={dragPoint} hovered={hovered} layout={layout} motion={motion} hud={hud} editorSize={editorSize} viewport={viewport} />
        <LabelProjection anchors={anchors} elements={elements} baseZoom={layout.baseZoom} /><SceneMetrics target={metrics} motion={motion} />
      </Canvas>
      <div className="projected-labels">{labels.map(label => <div data-editor={label.editor ? "true" : undefined} className={`projected-label ${label.className ?? ""}`} key={label.key} ref={node => { if (node) elements.set(label.key, node); else elements.delete(label.key); }}>{label.content}</div>)}</div>
      {!props.editor && <div hidden ref={node => hud.bind("element", node)} data-scene-ui className="world-camera-controls" aria-label="球馆视角"><button className="camera-heading" aria-label="视角回正" onClick={() => { const home = overview(layout); motion.move({ ...motion.snapshot(), yaw: home.yaw, pitch: home.pitch }); invalidate.current?.(); }}><Compass ref={node => hud.bind("compass", node)} size={17} /></button><button ref={node => hud.bind("minus", node)} aria-label="缩小球馆" onClick={() => zoomBy(1 / 1.25)}><Minus size={16} /></button><output ref={node => hud.bind("scale", node)}>1.0×</output><button ref={node => hud.bind("plus", node)} aria-label="放大球馆" onClick={() => zoomBy(1.25)}><Plus size={16} /></button><button aria-label="恢复三场全景" onClick={() => { cancel(); motion.move(frameOverview(layout, motion.snapshot())); invalidate.current?.(); }}><Scan size={16} />全景</button></div>}
      <output hidden aria-hidden="true" data-venue-metrics data-world-courts={props.state.courts.length} data-world-layout={JSON.stringify(props.state.courts.map(c => [c.id, courtCenter(c.number, layout)]))} data-record-revision={props.state.revision} ref={metrics} />
    </SceneBoundary>
  </div>;
}
