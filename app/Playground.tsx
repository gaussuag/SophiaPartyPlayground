"use client";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, CloudCheck, CloudOff, Ellipsis, Flag, Info, LayoutGrid, List, LoaderCircle, LogIn, LogOut, RefreshCw, RotateCcw, Trophy, X } from "lucide-react";
import { project, type CompetitionCommand, type MatchView } from "../src/modules/competition";
import type { PlayerSelection, SelectionBasis, SlotSelection, VenueIntent } from "../src/modules/venue";
import { placementCommand, placementTargets } from "./placements";
import { ScoreboardEditor, scoreTarget, type ScoreTarget } from "./ScoreboardEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { GameDrawer } from "./GameDrawer";
import { LineupNames, MatchPanel, namesFor, type LineupEdit } from "./MatchPanel";
import { Schedule, Records } from "./ScheduleAndRecords";
import { useEventSession } from "./useEventSession";
import { SITE_TITLE } from "../src/config/event";
import "./game.css";
import "./world.css";

const Venue = lazy(() => import("../src/modules/venue").then(m => ({ default: m.Venue })));
type Panel = "rounds" | "schedule" | "records" | "tools" | "match" | null;
type Confirmation = { title: string; body: ReactNode; label: string; command: CompetitionCommand; basis: SelectionBasis };

export function Playground({ defaultEventId, localDevelopment }: { defaultEventId: string; localDevelopment: boolean }) {
  const [eventId] = useState(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("event");
    return requested && /^[a-zA-Z0-9_-]{1,80}$/.test(requested) ? requested : defaultEventId;
  });
  const { session, view } = useEventSession(eventId);
  const [panel, setPanel] = useState<Panel>(null);
  const [viewedRoundId, setViewedRoundId] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [cameraRequest, setCameraRequest] = useState<{ courtId: string | null; key: number }>({ courtId: null, key: 0 });
  const [selection, setSelection] = useState<PlayerSelection | null>(null);
  const [slotFocus, setSlotFocus] = useState<SlotSelection | null>(null);
  const [score, setScore] = useState<ScoreTarget | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [lineupEdit, setLineupEdit] = useState<LineupEdit | null>(null);
  const [hint, setHint] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const state = view?.state;
  const readOnly = view?.role === "viewer";
  const canWrite = !!view && view.role !== "viewer" && view.status === "synced" && view.cacheReady && !view.pending.length;
  const projection = state ? project(state, { roundId: viewedRoundId ?? undefined }) : null;
  const focused = projection?.matches.find(m => m.courtId === courtId);
  const edit = lineupEdit?.matchId === focused?.id ? lineupEdit : null;
  const canArrange = canWrite && (!!edit || state?.phase === "ACTIVE" && !!projection?.isCurrent && projection.matches.some(m => m.phase === "PLANNING"));
  const slots = focused ? focused.draftSlots.map(s => ({
    ...s,
    playerId: edit ? edit.participants.find(p => p.slotId === s.id)?.playerId ?? null
      : focused.phase === "PLANNING" ? s.playerId
      : focused.participants.find(p => p.slotId === s.id)?.playerId ?? null,
  })) : [];
  const targets = state && projection && !readOnly ? placementTargets(state, projection, selection?.playerId ?? null, edit) : [];
  const sceneView = projection && edit && state
    ? { ...projection, matches: projection.matches.map(m => m.id === edit.matchId ? { ...m, participants: namesFor(state, slots) } : m) }
    : projection;
  const previousActive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previousActive.current !== undefined && previousActive.current !== state?.activeRoundId && viewedRoundId === null) {
      setSelection(null); setSlotFocus(null); setLineupEdit(null); setHint("");
    }
    previousActive.current = state?.activeRoundId;
  }, [state?.activeRoundId, viewedRoundId]);

  function clearSelection() { setSelection(null); setSlotFocus(null); setHint(""); }
  function flyTo(id: string | null) { setCameraRequest(previous => ({ courtId: id, key: previous.key + 1 })); }
  function chooseCourt(id: string, zoom = true) {
    if (lineupEdit && state?.matches.find(m => m.id === lineupEdit.matchId)?.courtId !== id) { setLineupEdit(null); clearSelection(); }
    setCourtId(id); setSlotFocus(null); setHint("");
    if (zoom) flyTo(id);
  }
  function chooseRound(id: string) {
    setViewedRoundId(id === state?.activeRoundId ? null : id); setCourtId(null); setLineupEdit(null); clearSelection(); setPanel(null); flyTo(null);
  }
  function selectMatch(roundId: string, nextCourtId: string) {
    setViewedRoundId(roundId === state?.activeRoundId ? null : roundId); setCourtId(nextCourtId); setLineupEdit(null); clearSelection(); setPanel(null); flyTo(nextCourtId);
  }
  function ask(title: string, body: ReactNode, label: string, command: CompetitionCommand) {
    if (!state) return;
    setPanel(null); setConfirm({ title, body, label, command, basis: { revision: state.revision, generation: state.generation } });
  }
  function editLineup(next: LineupEdit | null) {
    setLineupEdit(next); clearSelection(); setPanel(null);
    if (next && state) {
      const match = state.matches.find(m => m.id === next.matchId)!;
      setViewedRoundId(match.roundId); setCourtId(match.courtId); flyTo(match.courtId);
    }
  }
  async function openScore(match: MatchView) {
    if (!session || !state) return;
    setPanel(null);
    if (!readOnly && match.phase === "PLAYING" && !await session.dispatch({ type: "BeginResultEntry", matchId: match.id })) return;
    const latest = session.getView().state!;
    if (!latest.matches.find(m => m.id === match.id)?.activeLineupRevisionId) { setHint("记录已更新，请重新打开记分牌"); return; }
    const target = scoreTarget(latest, match.id);
    const draft = session.getView().drafts[match.id];
    const result = latest.results.find(r => r.id === target.resultRevisionId);
    if (!readOnly && !draft) await session.saveDraft({
      eventId: latest.id, matchId: match.id, lineupRevisionId: target.lineupRevisionId, resultRevisionId: target.resultRevisionId,
      generation: latest.generation, whiteInput: result ? String(result.whiteScore) : "",
      blackInput: result ? String(result.blackScore) : "", updatedAt: new Date().toISOString(),
    });
    setScore(target); clearSelection();
  }
  async function place(playerId: string, matchId: string, slotId: string, basis: SelectionBasis) {
    if (!state || !projection || !session || !canWrite) return;
    if (basis.revision !== state.revision || basis.generation !== state.generation) {
      clearSelection(); setHint("记录已更新，请重新点选球友"); return;
    }
    const target = placementTargets(state, projection, playerId, edit).find(t => t.matchId === matchId && t.slotId === slotId);
    if (!target?.allowed) { setHint(target?.reason ?? "这个位置暂时不能安排"); return; }
    if (edit) {
      setLineupEdit({ ...edit, participants: edit.participants.map(p => p.slotId === slotId ? { ...p, playerId } : p) });
      clearSelection(); return;
    }
    const command = placementCommand(state, target, playerId, basis);
    if (!command) return;
    if (target.occupantId) {
      const old = state.players.find(p => p.id === target.occupantId)!;
      const next = state.players.find(p => p.id === playerId)!;
      const match = state.matches.find(m => m.id === matchId)!;
      ask("替换这个位置？", <><p>第 {projection.round.number} 轮 · {state.courts.find(c => c.id === target.courtId)!.number} 号场 · {match.label}</p><p className="replacement-names">{old.name} <ArrowRight size={16} /> {next.name}</p></>, "确认替换", command);
      return;
    }
    if (await session.dispatch(command, basis)) { setCourtId(target.courtId); clearSelection(); }
  }
  async function onIntent(intent: VenueIntent) {
    if (!state || !projection || !session || score) return;
    if (intent.type === "court") { chooseCourt(intent.courtId); return; }
    if (lineupEdit && (intent.type === "start" || intent.type === "scoreboard")) { setHint("请先保存或取消名单更正"); return; }
    if (intent.type === "start") { const match = projection.matches.find(m => m.id === intent.matchId); if (match && canWrite) startMatch(match); return; }
    if (intent.type === "scoreboard") {
      const match = projection.matches.find(m => m.id === intent.matchId);
      if (!match) return;
      chooseCourt(match.courtId, false);
      if (match.phase !== "PLANNING") await openScore(match);
      else if (match.canStart && !readOnly && canWrite) startMatch(match);
      else chooseCourt(match.courtId);
      return;
    }
    if (intent.type === "place") { await place(intent.playerId, intent.matchId, intent.slotId, intent.basis); return; }
    if (intent.type === "slot") {
      const target = targets.find(t => t.matchId === intent.matchId && t.slotId === intent.slotId);
      if (!target || !canWrite) return;
      if (selection) await place(selection.playerId, target.matchId, target.slotId, selection.basis);
      else { setCourtId(target.courtId); setSlotFocus({ matchId: target.matchId, slotId: target.slotId, basis: { revision: state.revision, generation: state.generation } }); setHint(""); }
      return;
    }
    if (!canArrange) { if (!intent.dragging) setProfileId(intent.playerId); return; }
    if (slotFocus && !intent.dragging) { await place(intent.playerId, slotFocus.matchId, slotFocus.slotId, slotFocus.basis); return; }
    setSlotFocus(null); setSelection({ playerId: intent.playerId, basis: { revision: state.revision, generation: state.generation } }); setHint("");
  }

  const chosenPlayer = state?.players.find(p => p.id === selection?.playerId);
  const chosenPosition = targets.find(t => t.matchId === slotFocus?.matchId && t.slotId === slotFocus.slotId);
  const reservation = chosenPlayer && projection?.matches.find(m => m.phase === "PLANNING" && m.draftSlots.some(s => s.playerId === chosenPlayer.id));
  const returnTo = encodeURIComponent("/?event=" + eventId);
  const busy = view?.status === "saving";
  const message = hint || (view && (view.status === "offline" || view.status === "conflict" || view.status === "unknown-outcome" || view.errorCode) ? view.message : "");
  const allClosed = state?.phase === "ACTIVE" && state.rounds.every(r => r.phase === "CLOSED");
  const profile = state?.players.find(p => p.id === profileId);
  function startMatch(match: MatchView) {
    if (!state || !projection || !canWrite || !match.canStart) return;
    setCourtId(match.courtId);
    ask("确认上场", <><p>第 {projection.round.number} 轮 · {state.courts.find(c => c.id === match.courtId)!.number} 号场 · {match.label}</p><LineupNames participants={namesFor(state, match.draftSlots)} /></>, "确认上场并开始", { type: "StartMatch", matchId: match.id });
  }

  return <div className="game-shell">
    {state && projection && sceneView && session && view
      ? <main className="game-stage" aria-label="Sophia 三维球馆">
          <Suspense fallback={<div className="game-loading"><LoaderCircle size={24} /></div>}>
            <Venue state={state} view={sceneView} courtId={courtId} cameraRequest={cameraRequest} selection={selection} slotSelection={slotFocus} placements={targets}
              editable={canArrange && !score} canWrite={canWrite} readOnly={!!readOnly} editingMatchId={edit?.matchId} onIntent={i => void onIntent(i)}
              editor={score ? { matchId: score.matchId, content: <ScoreboardEditor key={score.matchId} target={score} session={session} view={view} onClose={() => setScore(null)} onRebind={setScore} /> } : undefined} />
          </Suspense>
        </main>
      : <main className="game-boot"><LoaderCircle size={28} /><h1>{view?.notFound ? "球馆准备中" : "正在进入球馆"}</h1>
          {view?.notFound && localDevelopment && <><a className="button secondary" target="_top" href={"/signin-with-chatgpt?return_to=" + returnTo}>管理登录</a><button className="button primary" onClick={async () => {
            const response = await fetch("/api/local/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) });
            const result = await response.json() as { error?: { message?: string } };
            if (!response.ok) setHint(result.error?.message ?? "初始化失败"); else void session?.refresh();
          }}>创建本地演练</button></>}
          {view?.notFound && !localDevelopment && <a className="button secondary" href={"/setup?event=" + encodeURIComponent(eventId)}>活动管理</a>}
        </main>}
    <header className="game-header">
      <button className="game-brand" aria-label="Sophia 球馆总览" title={SITE_TITLE} onClick={() => { setScore(null); setPanel(null); setCourtId(null); setLineupEdit(null); clearSelection(); flyTo(null); }}><span className="brand-mark"><i /><i /><i /><i /></span><span className="game-brand-name"><strong>SOPHIA</strong><small>SUNSHINE CUP</small></span></button>
      {projection && <button className="game-round-switch" disabled={!!score} aria-label="切换轮次" onClick={() => setPanel("rounds")}><span>第 {projection.round.number} 轮</span><small>{projection.completed}/{projection.total}</small><ChevronDown size={14} /></button>}
      <div className="game-header-actions"><button className={"icon-button sync-icon " + (view?.status ?? "loading")} aria-label={"同步记录：" + (view?.message ?? "连接中")} onClick={() => void session?.refresh()}>{busy || view?.status === "loading" ? <LoaderCircle size={19} className="spin" /> : view?.status === "offline" || view?.status === "unknown-outcome" ? <CloudOff size={20} /> : <CloudCheck size={20} />}</button><button className="icon-button" disabled={!!score} aria-label="更多选项" onClick={() => setPanel("tools")}><Ellipsis size={22} /></button></div>
    </header>
    <output className="sr-only" aria-live="polite">{view?.message}</output>
    {message && <div className="game-toast" role="status" aria-live="polite"><span>{message}</span>{view?.status === "unknown-outcome" ? <button className="text-button" onClick={() => void session?.retryPending()}>核对重试</button> : view?.status === "offline" && !hint ? <button className="text-button" onClick={() => void session?.refresh()}>重连</button> : <button className="icon-button" aria-label="收起提示" onClick={() => { setHint(""); if (view?.errorCode || view?.status === "conflict") void session?.refresh(); }}><X size={15} /></button>}</div>}
    {state && projection && view && session && <><div className="game-context">
      {viewedRoundId && viewedRoundId !== state.activeRoundId && state.activeRoundId && <button className="game-current-link" disabled={!!score} onClick={() => chooseRound(state.activeRoundId!)}>返回当前轮 <ArrowRight size={13} /></button>}
      {edit && <div className="game-edit-banner"><span>更正参赛者</span><button className="icon-button" aria-label="取消名单更正" onClick={() => editLineup(null)}><X size={16} /></button></div>}
    </div>{!score && <div className="game-hud">
      {selection && chosenPlayer ? <div className="game-selection-bar"><i className={"team-dot " + chosenPlayer.teamId.toLowerCase()} /><strong>{chosenPlayer.name}</strong>{reservation && !edit && <button className="return-player" aria-label={"移出 " + chosenPlayer.name} disabled={!canWrite} onClick={async () => { const slot = reservation.draftSlots.find(s => s.playerId === chosenPlayer.id)!; if (await session.dispatch({ type: "RemovePlayer", matchId: reservation.id, slotId: slot.id }, selection.basis)) clearSelection(); }}><RotateCcw size={15} />回候场</button>}<button className="icon-button" aria-label="查看球友资料" onClick={() => setProfileId(chosenPlayer.id)}><Info size={17} /></button><button className="icon-button" aria-label="取消选择球友" onClick={clearSelection}><X size={18} /></button></div>
        : slotFocus && chosenPosition ? <div className="game-selection-bar"><i className={"team-dot " + chosenPosition.sideId.toLowerCase()} /><strong>{chosenPosition.sideId === "WHITE" ? "白队" : "黑队"} · {chosenPosition.gender === "MALE" ? "男" : chosenPosition.gender === "FEMALE" ? "女" : "不限性别"}</strong><button className="icon-button" aria-label="取消位置选择" onClick={clearSelection}><X size={18} /></button></div>
        : !readOnly && <div className="game-primary-action">
          {edit ? <button className="button primary" disabled={!canWrite} onClick={() => ask("确认实际参赛者", <><p>第 {projection.round.number} 轮 · {state.courts.find(c => c.id === focused!.courtId)!.number} 号场 · {focused!.label}</p><LineupNames participants={namesFor(state, slots)} /></>, "保存名单更正", { type: "CorrectRecordedLineup", ...edit, reason: "RECORDED_LINEUP_ERROR" })}>保存名单更正 <Check size={17} /></button>
            : state.phase === "PREPARED" || state.phase === "WARMUP" ? <button className="button primary" disabled={!canWrite} onClick={() => ask("开始第一轮", <p>开放三块球场的正式比赛。</p>, "开放第一轮", { type: "OpenFirstRound" })}>开始第一轮 <ArrowRight size={17} /></button>
            : projection.canAdvance ? <button className="button primary" disabled={!canWrite} onClick={() => ask(projection.round.number === 7 ? "关闭第七轮" : "进入下一轮", <p>本轮 {projection.total} 场已完成。</p>, projection.round.number === 7 ? "关闭第七轮" : "确认进入下一轮", { type: "AdvanceRound", roundId: projection.round.id })}>{projection.round.number === 7 ? "关闭第七轮" : "进入下一轮"} <ArrowRight size={17} /></button>
            : allClosed ? <button className="button primary" disabled={!canWrite} onClick={() => ask("结束活动", <p>七轮二十场已完成。</p>, "结束活动", { type: "FinishEvent" })}>结束活动 <Check size={17} /></button>
            : null}
        </div>}
    </div>}</>}
    {!score && <nav className="game-dock" aria-label="主要导航">
      <button aria-current={!panel ? "page" : undefined} className={!panel ? "active" : ""} onClick={() => setPanel(null)}><LayoutGrid size={19} /><span>球馆</span></button>
      <button className={panel === "schedule" ? "active" : ""} onClick={() => setPanel("schedule")}><List size={19} /><span>赛程</span></button>
      <button className={panel === "records" ? "active" : ""} onClick={() => setPanel("records")}><Trophy size={19} /><span>赛果</span></button>
    </nav>}
    {panel && state && projection && session && view && <GameDrawer title={panel === "rounds" ? "轮次" : panel === "schedule" ? "赛程" : panel === "records" ? "赛果" : panel === "match" ? "场次详情" : "球馆"} onClose={() => setPanel(null)} className={panel === "match" ? "game-details" : ""}>
      {panel === "rounds" && <div className="game-round-grid">{state.rounds.map(round => <button key={round.id} aria-label={`第 ${round.number} 轮`} aria-pressed={round.id === projection.round.id} className={round.id === projection.round.id ? "selected" : ""} onClick={() => chooseRound(round.id)}><strong>{String(round.number).padStart(2, "0")}</strong>{round.phase === "CLOSED" ? <Check size={13} /> : round.phase === "OPEN" ? <i /> : null}</button>)}</div>}
      {panel === "schedule" && <Schedule state={state} onSelect={selectMatch} />}
      {panel === "records" && <Records state={state} view={view} session={session} onSelect={selectMatch} />}
      {panel === "match" && focused && <MatchPanel state={state} view={view} session={session} projection={projection} match={focused} slots={slots}
        onArrange={() => { setPanel(null); clearSelection(); }} edit={edit} setEdit={editLineup} hint={hint} setHint={setHint} ask={ask} openScore={m => void openScore(m)} />}
      {panel === "tools" && <div className="game-tools"><p className="tool-identity">{view.role === "admin" ? "活动管理" : view.role === "operator" ? "操作员" : "观赛"}{localDevelopment && <small>本地演练</small>}</p>{focused && <button onClick={() => setPanel("match")}><Ellipsis size={18} />{state.courts.find(c => c.id === focused.courtId)!.number} 号场详情与纠错</button>}<button onClick={() => { setPanel(null); setShowHelp(true); }}><Info size={18} />操作说明</button><button onClick={() => void session.refresh()}><RefreshCw size={18} />同步记录</button>{!readOnly && state.phase === "PREPARED" && <button disabled={!canWrite} onClick={async () => { if (await session.dispatch({ type: "StartWarmup" })) setPanel(null); }}><Flag size={18} />开始热身</button>}{readOnly ? <a target="_top" href={"/signin-with-chatgpt?return_to=" + returnTo}><LogIn size={18} />管理登录</a> : <a target="_top" href={"/signout-with-chatgpt?return_to=" + returnTo}><LogOut size={18} />退出管理</a>}<small className="tool-sync-time">{view.lastSyncedAt ? "最后同步 " + new Date(view.lastSyncedAt).toLocaleTimeString("zh-CN") : "尚未同步"} · v{state.revision}</small></div>}
      {!localDevelopment && panel === "tools" && <a className="game-setup-link" href={"/setup?event=" + encodeURIComponent(eventId)}>身份与权限</a>}
    </GameDrawer>}
    {confirm && session && <ConfirmDialog title={confirm.title} actionLabel={confirm.label} busy={busy} onClose={() => setConfirm(null)} onConfirm={async () => { const ok = await session.dispatch(confirm.command, confirm.basis); setConfirm(null); clearSelection(); if (ok && confirm.command.type === "CorrectRecordedLineup") setLineupEdit(null); }}>{confirm.body}</ConfirmDialog>}
    {profile && <ConfirmDialog title={profile.name} actionLabel="返回球馆" cancelLabel={null} busy={false} onClose={() => setProfileId(null)} onConfirm={() => setProfileId(null)}><p>{profile.teamId === "WHITE" ? "白队" : "黑队"} · {profile.gender === "MALE" ? "男" : "女"}</p><p>{projection?.playerStates[profile.id].label}</p></ConfirmDialog>}
    {showHelp && <ConfirmDialog title="安排一场比赛" actionLabel="回到球馆" cancelLabel={null} busy={false} onClose={() => setShowHelp(false)} onConfirm={() => setShowHelp(false)}><ol className="help-steps"><li>单指划空地旋转视角；双指缩放、移动；点全景复位。</li><li>点球场放大；点球友再点亮起的位置，也可直接拖入。</li><li>阵容齐备后，点场内记分牌确认上场。</li><li>真实比赛结束后，点“录入赛果”填写比分。</li><li>全部完成后，进入下一轮。</li></ol></ConfirmDialog>}
  </div>;
}






