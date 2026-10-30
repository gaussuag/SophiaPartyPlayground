"use client";
import { ArrowRight, Flag } from "lucide-react";
import type { ReactNode } from "react";
import type { CompetitionCommand, EventProjection, EventState, MatchView, Participant, Slot } from "../src/modules/competition";
import type { EventSession, SessionView } from "../src/modules/session";
import { canExecute } from "../src/modules/records/permissions";
import { matchStatus } from "./match-presentation";
export const reasonNames: Record<string, string> = { ACTUAL_NOT_STARTED: "实际尚未开打", ACCIDENTAL_END: "误触结束", SCORE_ENTRY_ERROR: "比分录错", SIDES_SWAPPED: "双方填反", REVERT_CORRECTION: "撤销上次更正", RESULT_ENTERED_TOO_EARLY: "提前误录赛果", RECORDED_LINEUP_ERROR: "实际名单录错" };
export type LineupEdit = { matchId: string; lineupRevisionId: string; participants: { slotId: string; playerId: string }[] };
export type Ask = (title: string, body: ReactNode, label: string, command: CompetitionCommand) => void;
export function namesFor(state: EventState, slots: Slot[]): Participant[] {
  return slots.map(s => { const p = state.players.find(p => p.id === s.playerId)!; return { slotId: s.id, sideId: s.sideId, playerId: p.id, name: p.name, gender: p.gender, teamId: p.teamId }; });
}
export function LineupNames({ participants }: { participants: Participant[] }) {
  return <div className="confirmation-lineups">{(["WHITE", "BLACK"] as const).map(side => <div key={side}><span className="team-heading"><i className={`team-dot ${side.toLowerCase()}`} />{side === "WHITE" ? "白队" : "黑队"}</span><strong>{participants.filter(p => p.sideId === side).map(p => p.name).join(" / ") || "尚未安排"}</strong></div>)}</div>;
}
export function History({ state, matchId }: { state: EventState; matchId: string }) {
  const results = state.results.filter(r => r.matchId === matchId).toReversed();
  const lineups = state.lineups.filter(l => l.matchId === matchId).toReversed();
  if (!results.length && !lineups.length) return null;
  const match = state.matches.find(m => m.id === matchId)!;
  return <details className="history-details"><summary>阵容与赛果版本 <span>{results.length} 个赛果版本</span></summary><ol>{results.map(r => <li key={r.id}><strong>白队 {r.whiteScore} : {r.blackScore} 黑队 {match.activeResultRevisionId === r.id && <em>当前有效</em>}</strong><span>{r.reason ? reasonNames[r.reason] ?? r.reason : "首次提交"} · {new Date(r.submittedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><small>阵容：{state.lineups.find(l => l.id === r.lineupRevisionId)?.participants.map(p => p.name).join(" / ")}</small></li>)}{lineups.map(l => <li key={l.id}><strong>{l.participants.map(p => p.name).join(" / ")}</strong><span>{l.reason ? "实际名单更正" : "确认上场名单"}{l.id === match.activeLineupRevisionId ? " · 当前有效" : " · 历史版本"}</span></li>)}</ol></details>;
}
export function MatchPanel({ state, view, session, projection, match, slots, onArrange, edit, setEdit, hint, setHint, ask, openScore }: {
  state: EventState; view: SessionView; session: EventSession; projection: EventProjection; match: MatchView; slots: Slot[];
  onArrange: () => void; edit: LineupEdit | null; setEdit: (edit: LineupEdit | null) => void;
  hint: string; setHint: (hint: string) => void; ask: Ask; openScore: (m: MatchView) => void;
}) {
  const readOnly = view.role === "viewer";
  const canWrite = !readOnly && view.status === "synced" && !view.pending.length;
  const canManage = canExecute(view.role, "StartMatch");
  const canCorrect = canExecute(view.role, "CorrectResult");
  const clearEdit = () => { setEdit(null); setHint(""); };
  const prefix = "第 " + projection.round.number + " 轮 · " + state.courts.find(c => c.id === match.courtId)!.number + " 号场 · " + match.label;
  return <section className="match-panel" aria-label={match.label + "比赛操作"}>
    <div className="match-panel-heading"><div><p className="eyebrow">第 {projection.round.number} 轮 · {state.courts.find(c => c.id === match.courtId)!.number} 号场</p><h2>{match.label}</h2></div><span className={"phase-badge " + match.phase.toLowerCase()}>{matchStatus(match)}</span></div>
    {match.result && <div className="final-score"><span>白队 <b>{match.result.whiteScore}</b></span><em>:</em><span><b>{match.result.blackScore}</b> 黑队</span><small><Flag size={13} />{match.result.winnerTeamId === "WHITE" ? "白队" : "黑队"}获胜</small></div>}
    <LineupNames participants={namesFor(state, slots.filter(s => s.playerId))} />
    {!readOnly && (match.phase === "PLANNING" && projection.isCurrent || edit && canCorrect) && <button className="button secondary" onClick={onArrange}>到场内安排 <ArrowRight size={16} /></button>}
    {(hint || edit) && <p className="inline-hint" role="status">{hint || "更正实际参赛者，通过角色选择后确认；此操作用于纠正录错的名单。"}</p>}
    <div className="match-actions">{edit && canCorrect ? <>
      <button className="button primary" disabled={!canWrite} onClick={() => ask("核对实际参赛者", <><p>{prefix}</p><LineupNames participants={namesFor(state, slots)} /></>, "保存名单更正", { type: "CorrectRecordedLineup", ...edit, reason: "RECORDED_LINEUP_ERROR" })}>确认实际名单更正</button><button className="text-button" onClick={clearEdit}>放弃本机更正草稿</button>
    </> : <>
      {match.phase === "PLANNING" && projection.isCurrent && !readOnly && <>
        {canManage && <button className="button primary" disabled={!canWrite || !match.canStart} onClick={() => ask("确认上场并开始比赛", <><p>{prefix}</p><LineupNames participants={namesFor(state, slots)} /></>, "确认上场并开始", { type: "StartMatch", matchId: match.id })}><Flag size={17} />确认上场并开始</button>}
        {slots.some(s => s.playerId) && <button className="text-button" disabled={!canWrite} onClick={() => void session.dispatch({ type: "CancelDraft", matchId: match.id })}>取消本场阵容草稿</button>}
      </>}
      {(match.phase === "PLAYING" || match.phase === "AWAITING_RESULT") && !readOnly && <button className="button primary" onClick={() => openScore(match)}>录入最终比分 <ArrowRight size={17} /></button>}
      {match.phase === "PLAYING" && canManage && <button className="text-button" disabled={!canWrite} onClick={() => ask("确认真实比赛尚未开打", <p>{prefix}<br />撤销后恢复原阵容草稿，保留此次确认记录。</p>, "尚未开打，撤销误开赛", { type: "UndoStart", matchId: match.id, reason: "ACTUAL_NOT_STARTED" })}>误开赛？撤销上场</button>}
      {match.phase === "AWAITING_RESULT" && projection.isCurrent && canManage && <button className="text-button" disabled={!canWrite} onClick={() => ask("恢复比赛中", <p>{prefix}<br />撤销旧版结束声明，保留原阵容。</p>, "恢复比赛中", { type: "UndoEndDeclaration", matchId: match.id, reason: "ACCIDENTAL_END" })}>撤销旧版结束声明</button>}
      {match.phase === "COMPLETED" && <>
        <button className="button secondary" onClick={() => openScore(match)}>{canCorrect ? "更正最终比分" : "查看最终比分"}</button>
        {canCorrect && projection.isCurrent && !match.result?.supersedes && <button className="text-button" disabled={!canWrite} onClick={() => ask("撤回首次赛果", <p>{prefix}<br />撤回后恢复比赛中，本轮暂不能推进，保留旧比分记录。</p>, "撤回并保留历史", { type: "WithdrawCurrentResult", matchId: match.id, reason: "RESULT_ENTERED_TOO_EARLY" })}>撤回首次误录赛果</button>}
      </>}
      {canCorrect && (match.phase === "COMPLETED" || match.phase === "AWAITING_RESULT") && <button className="text-button" disabled={!canWrite} onClick={() => setEdit({ matchId: match.id, lineupRevisionId: match.activeLineupRevisionId!, participants: match.participants.map(p => ({ slotId: p.slotId, playerId: p.playerId })) })}>更正实际参赛者</button>}
    </>}</div>
    {readOnly && <p className="view-only-hint">你正在查看全员共享的比赛记录</p>}<History state={state} matchId={match.id} />
  </section>;
}
