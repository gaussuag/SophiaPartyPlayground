"use client";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArrowUpRight, Check, Compass, LockKeyhole, Mars, Minus, Pencil, Plus, RotateCcw, Scan, Venus } from "lucide-react";
import { Vector3 } from "three";
import { LabelProjection, Scene, SceneMetrics, slotKey, type Anchors, type Elements, type Point } from "./Scene";
import { CameraMotion } from "./camera-motion";
import { CameraHud } from "./camera-hud";
import { ScenePlay, ScenePlayLabels } from "./ScenePlay";
import { ScenePlayController } from "./scene-play";
import { VenuePerformance } from "./venue-performance";
import { VenueInput, groundAt, type PointerSample } from "./venue-input";
import type { VenueProps } from "./model";
import { cameraView, clampZoom, constrainNavigation, courtCenter, courtNavigation, frameOverview, isBenchPoint, overview, worldLayout } from "./world";

type ScreenPoint = { x: number; y: number };
const sample = (e: { pointerId: number; clientX: number; clientY: number }): PointerSample => ({ id: e.pointerId, x: e.clientX, y: e.clientY });
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
  const invalidate = useRef<(() => void) | null>(null);
  const anchors = useMemo<Anchors>(() => new Map(), []);
  const elements = useMemo<Elements>(() => new Map(), []);
  const metrics = useRef<HTMLOutputElement>(null);
  const dragPoint = useRef<Point | null>(null);
  const draggingPlayer = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [orbiting, setOrbiting] = useState(false);
  const [pressedPlayerId, setPressedPlayerId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [lost, setLost] = useState(false);
  const [size, setSize] = useState({ width: 390, height: 844 });
  const pendingSize = useRef<typeof size | null>(null);
  const layout = useMemo(() => worldLayout(size.width, size.height), [size]);
  const [viewport, setViewport] = useState({ height: 844, top: 0 });
  const [editorSize, setEditorSize] = useState({ width: 340, height: 390 });
  const [motion] = useState(() => new CameraMotion(overview(layout)));
  const [hud] = useState(() => new CameraHud(root));
  const [play] = useState(() => new ScenePlayController());
  const [timing] = useState(() => new VenuePerformance(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("venueMetrics")));
  const [input] = useState(() => new VenueInput(motion));
  const previousView = useRef({ key: props.cameraRequest.key, layout, measured: false });
  useEffect(() => {
    const previous = previousView.current;
    if (previous.key === props.cameraRequest.key && previous.layout === layout) return;
    input.cancel(); play.cancel();
    const changed = previous.key !== props.cameraRequest.key;
    const court = changed ? props.state.courts.find(c => c.id === props.cameraRequest.courtId) : undefined;
    const current = motion.snapshot();
    const sameOrientation = previous.layout.portrait === layout.portrait;
    const view = cameraView(current, previous.layout);
    const dx = (layout.viewportWidth - previous.layout.viewportWidth) / (2 * view.zoom);
    const dy = (layout.viewportHeight - previous.layout.viewportHeight) / (2 * view.zoom);
    const right: Point = [Math.cos(current.yaw), 0, -Math.sin(current.yaw)];
    const resized = { ...current, zoom: current.zoom * previous.layout.baseZoom / layout.baseZoom,
      center: current.center.map((n, i) => n + right[i] * dx - view.up[i] * dy) as Point };
    motion.move(court ? courtNavigation(court.number, layout, current) : !changed && sameOrientation && previous.measured ? constrainNavigation(resized, layout) : overview(layout), !changed);
    previousView.current = { key: props.cameraRequest.key, layout, measured: true };
    invalidate.current?.();
  }, [layout, motion, input, play, props.cameraRequest.key, props.cameraRequest.courtId, props.state.courts]);

  useEffect(() => {
    const node = root.current; if (!node) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      // Keep the same coordinate system and gain until all fingers release.
      if (input.active && (width / height < 1.1) !== previousView.current.layout.portrait) { input.cancel(); setSize({ width, height }); }
      else if (input.active) pendingSize.current = { width, height };
      else setSize({ width, height });
    });
    observer.observe(node);
    const update = () => setViewport({ height: window.visualViewport?.height ?? innerHeight, top: window.visualViewport?.offsetTop ?? 0 });
    const interrupt = () => input.cancel();
    update(); window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", interrupt);
    return () => {
      observer.disconnect(); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", interrupt); motion.stop();
    };
  }, [input, motion]);
  useEffect(() => {
    const node = root.current?.querySelector(".world-scoreboard-editor"); if (!node) return;
    const observer = new ResizeObserver(entries => { const box = entries[0].borderBoxSize[0]; setEditorSize({ width: box.inlineSize, height: box.blockSize }); });
    observer.observe(node); return () => observer.disconnect();
  }, [props.editor?.matchId]);
  useEffect(() => { if (props.editor || lost) input.cancel(); }, [props.editor, lost, input]);

  function projectPointer(clientX: number, clientY: number): Point | null {
    return input.ground({ x: clientX, y: clientY });
  }
  function zoomBy(factor: number, point?: ScreenPoint) {
    input.cancel();
    const bounds = root.current?.getBoundingClientRect(); if (!bounds) return;
    const at = point ?? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const current = motion.snapshot(), scaled = { ...current, zoom: clampZoom(current.zoom * factor) };
    const before = groundAt(at, current, layout, bounds), after = groundAt(at, scaled, layout, bounds);
    motion.move(constrainNavigation({ ...scaled, center: current.center.map((n, i) => n + before[i] - after[i]) as Point }, layout), true);
    invalidate.current?.();
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
      const key = slotKey(target.matchId, target.slotId), anchor = anchors.get(key); if (!anchor) continue;
      const destination = anchor.getWorldPosition(new Vector3());
      const distance = Math.hypot(location.x - destination.x, location.z - destination.z);
      if (distance < 2.1 && (!found || distance < found.distance)) found = { matchId: target.matchId, slotId: target.slotId, key, distance };
    }
    return found;
  }
  function begin(playerId: string, event: PointerEvent) {
    if (event.button === 0 && !props.editor) input.claimPlayer(sample(event), playerId);
  }
  function benchTarget(playerId: string, point: Point) {
    const player = props.state.players.find(p => p.id === playerId);
    const reserved = props.view.isCurrent && props.view.playerStates[playerId]?.status === "reserved";
    return player && reserved && !props.editingMatchId && isBenchPoint(point, player.teamId, layout) ? `bench:${player.teamId}` : null;
  }
  function cancel() { input.cancel(); }
  useLayoutEffect(() => {
    input.bind(
      () => ({ layout, bounds: root.current!.getBoundingClientRect(), editable: props.editable,
        draggablePlayerIds: props.editingMatchId ? undefined : props.state.players.filter(p => ["available", "reserved"].includes(props.view.playerStates[p.id].status)).map(p => p.id),
        disabled: !!props.editor || lost, basis: { revision: props.state.revision, generation: props.state.generation } }),
      {
        invalidate: () => invalidate.current?.(),
        capture: id => { try { root.current?.setPointerCapture(id); } catch { /* Native cancellation can precede React's event. */ } },
        release: id => { if (root.current?.hasPointerCapture(id)) root.current.releasePointerCapture(id); },
        activity(mode, id) {
          setPressedPlayerId(id ?? null); setOrbiting(mode === "orbit" || mode === "pan");
          if (mode !== "player") { dragPoint.current = null; draggingPlayer.current = null; setDragging(false); setHovered(null); }
        },
        select: playerId => props.onIntent({ type: "player", playerId }),
        drag(playerId, x, y) {
          if (!props.editable) return;
          if (draggingPlayer.current !== playerId) { draggingPlayer.current = playerId; setDragging(true); props.onIntent({ type: "player", playerId, dragging: true }); }
          const point = projectPointer(x, y); if (!point) return;
          dragPoint.current = point; setHovered(nearest(point)?.key ?? benchTarget(playerId, point)); invalidate.current?.();
        },
        drop(playerId, x, y, basis) {
          if (!props.editable) return;
          const point = projectPointer(x, y), target = point && nearest(point);
          if (target) props.onIntent({ type: "place", playerId, matchId: target.matchId, slotId: target.slotId, basis });
          else if (point && benchTarget(playerId, point)) props.onIntent({ type: "bench", playerId, basis });
        },
        settled() { if (pendingSize.current) { setSize(pendingSize.current); pendingSize.current = null; } },
      },
    );
  });
  const labels: { key: string; className?: string; editor?: boolean; content: ReactNode }[] = props.state.courts.map(c => {
    const match = props.view.matches.find(m => m.courtId === c.id);
    if (match && props.editor?.matchId === match.id) return { key: `court:${c.id}`, className: "board-anchor editing-board", editor: true, content: props.editor.content };
    const ready = match?.phase === "PLANNING" && match.canStart && props.view.isCurrent && props.state.phase === "ACTIVE";
    const canStart = ready && props.canConfirm;
    const locked = !!props.editor || !!props.editingMatchId || canStart && !props.canWrite;
    const action = !match ? "休息区" : match.phase === "PLANNING" ? props.readOnly ? "查看球场" : ready ? canStart ? "确认上场" : "等待确认" : "安排阵容" : match.phase === "PLAYING" || match.phase === "AWAITING_RESULT" ? props.readOnly ? "比赛进行中" : "录入赛果" : props.canCorrect ? "更正比分" : "查看赛果";
    return { key: `court:${c.id}`, className: "board-anchor", content: <button data-scene-ui className={`world-scoreboard ${match?.phase.toLowerCase() ?? "rest"} ${canStart ? "ready" : ""}`} aria-label={`${c.number} 号场 · ${action}`} title={`${c.number} 号场 · ${match?.label ?? "休息区"} · ${action}`} disabled={locked} onClick={() => props.onIntent(!match || match.phase === "PLANNING" && !canStart ? { type: "court", courtId: c.id } : canStart ? { type: "start", matchId: match!.id } : { type: "scoreboard", matchId: match!.id })}>
      <span className="board-face"><b>{String(c.number).padStart(2, "0")}</b>
        {match?.result ? <strong className="board-result">{match.result.whiteScore}<i>:</i>{match.result.blackScore}</strong> : <span className="board-action">{match?.phase === "PLANNING" && !ready ? match.label : match?.phase === "PLAYING" && props.readOnly ? "比赛中" : action}</span>}
        {canStart ? <Check size={14} aria-hidden="true" /> : match?.result && props.canCorrect ? <Pencil size={13} aria-hidden="true" /> : match ? <ArrowUpRight size={13} aria-hidden="true" /> : null}
      </span>
    </button> };
  });
  for (const player of props.state.players) {
    const status = props.view.playerStates[player.id];
    const selected = props.selection?.playerId === player.id;
    const target = props.slotSelection && props.placements.find(t => t.matchId === props.slotSelection!.matchId && t.slotId === props.slotSelection!.slotId);
    const mismatch = !!target && (target.sideId !== player.teamId || !!target.gender && target.gender !== player.gender);
    const locked = status.status === "playing" || status.status === "played_this_round";
    const pending = props.pending?.playerIds?.includes(player.id) || props.pending?.playerId === player.id;
    labels.push({
      key: `player:${player.id}`,
      content: <button className={`game-player-label ${player.teamId.toLowerCase()} ${selected || pressedPlayerId === player.id ? "selected" : ""} ${locked || mismatch ? "unavailable" : ""} ${pending ? "pending" : ""}`} data-player-id={player.id} aria-busy={pending} aria-pressed={selected} aria-label={`选择角色 ${player.name} ${player.id}${locked ? `，${status.label}` : ""}`} onClick={e => { if (e.detail === 0) props.onIntent({ type: "player", playerId: player.id }); }}><span>{player.name}</span>{locked && <LockKeyhole size={9} aria-hidden="true" />}</button>,
    });
  }
  for (const target of props.placements) {
    const selected = props.slotSelection?.matchId === target.matchId && props.slotSelection.slotId === target.slotId;
    if (target.occupantId && !props.selection && !selected && props.editingMatchId !== target.matchId) continue;
    const court = props.state.courts.find(c => c.id === target.courtId)!;
    const person = props.selection && props.state.players.find(p => p.id === props.selection!.playerId);
    const label = person ? `安排 ${person.name} 到 ${court.number} 号场 ${target.slotId}` : `${court.number} 号场 ${target.sideId === "WHITE" ? "白队" : "黑队"}${target.gender === "MALE" ? "男性" : target.gender === "FEMALE" ? "女性" : "自由"}位置 ${target.slotId}`;
    labels.push({ key: slotKey(target.matchId, target.slotId), className: "slot-anchor", content: <button className={`game-position ${target.allowed ? "allowed" : ""} ${selected || hovered === slotKey(target.matchId, target.slotId) ? "selected" : ""} ${target.occupantId ? "occupied" : ""} ${props.pending?.matchId === target.matchId && (!props.pending.slotId || props.pending.slotId === target.slotId) ? "pending" : ""} ${props.selection && !target.allowed ? "not-allowed" : ""}`} aria-label={label} disabled={!props.editable} onClick={() => props.onIntent({ type: "slot", matchId: target.matchId, slotId: target.slotId })}>{props.editingMatchId === target.matchId && target.occupantId ? <small>拟 {props.state.players.find(p => p.id === target.occupantId)?.name}</small> : props.selection || !target.gender ? <Plus size={18} /> : target.gender === "MALE" ? <Mars size={17} /> : <Venus size={17} />}</button> });
  }
  for (const side of ["WHITE", "BLACK"] as const) {
    const person = props.selection && props.state.players.find(p => p.id === props.selection!.playerId && p.teamId === side);
    const returning = person && props.editable && !props.editingMatchId && props.view.playerStates[person.id].status === "reserved";
    labels.push({ key: `bench:${side}`, content: returning
      ? <button data-scene-ui data-camera-ui className={`game-bench-marker return-target ${side.toLowerCase()} ${hovered === `bench:${side}` ? "selected" : ""}`} aria-label={`让 ${person.name} 回候场`} onClick={() => props.onIntent({ type: "bench", playerId: person.id, basis: props.selection!.basis })}><RotateCcw size={14} />回候场</button>
      : <span className={`game-bench-marker ${side.toLowerCase()}`}><i />{side === "WHITE" ? "白队" : "黑队"}</span> });
  }

  const fallback = <div className="scene-fallback"><p>球馆暂时无法显示</p><button className="button secondary" onClick={() => { setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>;
  return <div ref={root} data-compact={layout.compact} className={`venue game-venue ${dragging ? "dragging" : ""} ${orbiting ? "orbiting" : ""} ${props.editor ? "scoring" : ""}`} aria-label="三维球馆，单指旋转，双指缩放和平移，点选或拖拽球友" onContextMenu={e => e.preventDefault()}
    style={{ "--visible-height": `${viewport.height}px` } as React.CSSProperties}
    onClickCapture={e => { if (!props.editor && input.suppressClick && e.detail !== 0) { e.stopPropagation(); e.preventDefault(); } }}
    onPointerDownCapture={e => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const player = target.closest?.<HTMLElement>("[data-player-id]");
      input.down(sample(e), { playerId: player?.dataset.playerId, pan: e.shiftKey, ui: !!target.closest?.("[data-camera-ui]") });
    }}
    onPointerMove={e => {
      if (!input.owns(e.pointerId)) return;
      const started = timing.enabled ? performance.now() : 0;
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const event of samples) input.move(sample(event));
      input.move(sample(e));
      timing.input(started);
    }}
    onPointerUp={e => {
      if (!input.owns(e.pointerId)) return;
      const started = timing.enabled ? performance.now() : 0;
      input.up(sample(e)); timing.input(started);
    }}
    onPointerCancel={() => input.cancel()}
    onLostPointerCapture={e => input.lostCapture(e.pointerId, e.currentTarget.hasPointerCapture(e.pointerId))}>
    <SceneBoundary key={sceneRevision} fallback={fallback}>
      {lost && <div className="context-notice" role="status"><span>场景恢复中</span><button className="button secondary" onClick={() => { cancel(); setLost(false); setSceneRevision(n => n + 1); }}>重建场景</button></div>}
      <Canvas style={{ width: size.width, height: size.height }} orthographic camera={{ position: [3, 36, 42], near: 0.1, far: 180, zoom: 18 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} onCreated={s => {
        invalidate.current = s.invalidate;
        setLost(false);
      }} fallback={<span>三维球馆画布</span>}>
        <ambientLight intensity={1.65} /><directionalLight position={[6, 15, 10]} intensity={2.2} color="#fff1d2" /><directionalLight position={[-10, 5, -7]} intensity={0.5} color="#c7e4da" />
        <ContextRecovery onLost={() => { cancel(); play.cancel(); setLost(true); }} onRestored={() => { setLost(false); setSceneRevision(n => n + 1); }} />
        <Scene props={props} anchors={anchors} begin={begin} dragging={dragging} dragPoint={dragPoint} hovered={hovered} layout={layout} motion={motion} hud={hud} editorSize={editorSize} viewport={viewport} pressedPlayerId={pressedPlayerId} timing={timing} />
        <ScenePlay controller={play} layout={layout} anchors={anchors} disabled={!!props.editor || lost} />
        <LabelProjection anchors={anchors} elements={elements} baseZoom={layout.baseZoom} timing={timing} /><SceneMetrics target={metrics} motion={motion} timing={timing} />
      </Canvas>
      <div className="projected-labels">{labels.map(label => <div data-editor={label.editor ? "true" : undefined} className={`projected-label ${label.className ?? ""}`} key={label.key} ref={node => { if (node) elements.set(label.key, node); else elements.delete(label.key); }}>{label.content}</div>)}<ScenePlayLabels controller={play} elements={elements} disabled={!!props.editor || lost} /></div>
      {!props.editor && <div hidden ref={node => hud.bind("element", node)} data-scene-ui data-camera-ui className="world-camera-controls" aria-label="球馆视角"><button className="camera-heading" aria-label="视角回正" onClick={() => { const home = overview(layout); motion.move({ ...motion.snapshot(), yaw: home.yaw, pitch: home.pitch }); invalidate.current?.(); }}><Compass ref={node => hud.bind("compass", node)} size={17} /></button><button ref={node => hud.bind("minus", node)} aria-label="缩小球馆" onClick={() => zoomBy(1 / 1.25)}><Minus size={16} /></button><output ref={node => hud.bind("scale", node)}>1.0×</output><button ref={node => hud.bind("plus", node)} aria-label="放大球馆" onClick={() => zoomBy(1.25)}><Plus size={16} /></button><button aria-label="恢复三场全景" onClick={() => { cancel(); motion.move(frameOverview(layout, motion.snapshot())); invalidate.current?.(); }}><Scan size={16} />全景</button></div>}
      <output hidden aria-hidden="true" data-venue-metrics data-world-courts={props.state.courts.length} data-world-layout={JSON.stringify(props.state.courts.map(c => [c.id, courtCenter(c.number, layout)]))} data-record-revision={props.state.revision} ref={metrics} />
    </SceneBoundary>
  </div>;
}
