"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
import type { EventState, Participant } from "../src/modules/competition";
import type { EventSession, SessionView } from "../src/modules/session";

export type ScoreTarget = { matchId: string; lineupRevisionId: string; resultRevisionId: string | null; generation: number; participants: Participant[] };
export function ScoreboardEditor({ target, session, view, onClose, onRebind }: { target: ScoreTarget; session: EventSession; view: SessionView; onClose: () => void; onRebind: (t: ScoreTarget) => void }) {
  const state = view.state!;
  const match = state.matches.find(m => m.id === target.matchId)!;
  const round = state.rounds.find(r => r.id === match.roundId)!;
  const result = state.results.find(r => r.id === target.resultRevisionId);
  const readOnly = view.role === "viewer";
  const draft = readOnly ? undefined : view.drafts[match.id];
  const white = draft?.whiteInput ?? String(result?.whiteScore ?? "");
  const black = draft?.blackInput ?? String(result?.blackScore ?? "");
  const [reason, setReason] = useState<"SCORE_ENTRY_ERROR" | "SIDES_SWAPPED" | "REVERT_CORRECTION">("SCORE_ENTRY_ERROR");
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const stale = match.activeLineupRevisionId !== target.lineupRevisionId || target.generation !== state.generation || target.resultRevisionId !== match.activeResultRevisionId || !!draft && (draft.lineupRevisionId !== target.lineupRevisionId || draft.generation !== target.generation || (draft.resultRevisionId ?? null) !== target.resultRevisionId);
  const save = (whiteInput: string, blackInput: string) => session.saveDraft({ eventId: state.id, matchId: target.matchId, lineupRevisionId: draft?.lineupRevisionId ?? target.lineupRevisionId, resultRevisionId: draft?.resultRevisionId ?? (draft ? null : target.resultRevisionId), generation: draft?.generation ?? target.generation, whiteInput, blackInput, updatedAt: new Date().toISOString() });
  const rebind = () => {
    const currentLineup = state.lineups.find(l => l.id === match.activeLineupRevisionId);
    if (!currentLineup) return;
    const participants = currentLineup.participants;
    onRebind({ matchId: match.id, lineupRevisionId: match.activeLineupRevisionId!, resultRevisionId: match.activeResultRevisionId, generation: state.generation, participants });
    void session.saveDraft({ eventId: state.id, matchId: match.id, lineupRevisionId: match.activeLineupRevisionId!, resultRevisionId: match.activeResultRevisionId, generation: state.generation, whiteInput: white, blackInput: black, updatedAt: new Date().toISOString() });
  };
  const busy = view.status === "saving";
  return <section ref={panel} tabIndex={-1} data-scene-ui className="world-scoreboard-editor" role="dialog" aria-modal="false" aria-labelledby="score-title" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <form className="score-inner" noValidate onSubmit={async e => {
      e.preventDefault(); setError("");
      if (!/^\d+$/.test(white) || !/^\d+$/.test(black) || !Number.isSafeInteger(Number(white)) || !Number.isSafeInteger(Number(black))) { setError("请填写双方非负整数比分，空白不等于 0"); return; }
      if (Number(white) === Number(black)) { setError("请输入有胜负的最终比分"); return; }
      if (stale) { setError("请先核对已变化的阵容和记录"); return; }
      const scores = { matchId: target.matchId, lineupRevisionId: target.lineupRevisionId, whiteScore: Number(white), blackScore: Number(black) };
      const ok = await session.dispatch(target.resultRevisionId ? { type: "CorrectResult", ...scores, resultRevisionId: target.resultRevisionId, reason } : { type: "SubmitResult", ...scores });
      if (ok) { await session.clearDraft(match.id); onClose(); }
    }}>
      <header className="dialog-heading"><div><p className="eyebrow">第 {round.number} 轮 · {state.courts.find(c => c.id === match.courtId)!.number} 号场 · {match.label}</p><h2 id="score-title">{readOnly ? "记分牌" : target.resultRevisionId ? "更正比分" : "最终比分"}</h2></div><button type="button" className="icon-button" aria-label="关闭记分牌并保留草稿" onClick={onClose}><X size={21} /></button></header>
      <div className="scoreboard-body">
      {stale && <div className="notice warning" role="alert"><strong>阵容或赛果已在其他设备改变</strong><p>{readOnly ? "请关闭后重新打开记分牌，查看最新记录。" : "输入已保留。请查看最新名单与比分，再确认是否沿用输入。"}</p><p>{state.lineups.find(l => l.id === match.activeLineupRevisionId)?.participants.map(p => p.name).join(" / ")}</p><p>{match.activeResultRevisionId ? (() => { const r = state.results.find(r => r.id === match.activeResultRevisionId)!; return `当前有效比分：白队 ${r.whiteScore} : ${r.blackScore} 黑队`; })() : "当前尚无有效赛果"}</p>{!readOnly && <button type="button" className="button secondary" disabled={!match.activeLineupRevisionId} onClick={rebind}>已核对当前记录，沿用输入</button>}</div>}
      <div className="score-inputs">
        {(["WHITE", "BLACK"] as const).map(side => <label key={side} className={`score-side ${side === "BLACK" ? "black-side" : ""}`}><span className="team-heading"><i className={`team-dot ${side.toLowerCase()}`} />{side === "WHITE" ? "白队" : "黑队"}</span><span className="score-names">{target.participants.filter(p => p.sideId === side).map(p => p.name).join(" / ")}</span>{readOnly ? <strong className="score-readout">{side === "WHITE" ? white || "—" : black || "—"}</strong> : <input autoComplete="off" inputMode="numeric" pattern="[0-9]*" type="text" maxLength={16} disabled={busy} aria-label={side === "WHITE" ? "白队最终比分" : "黑队最终比分"} placeholder="—" value={side === "WHITE" ? white : black} onChange={e => { setError(""); void save(side === "WHITE" ? e.target.value : white, side === "BLACK" ? e.target.value : black); }} />}</label>)}
      </div>
      {!readOnly && <button type="button" disabled={busy} className="text-button swap" onClick={() => { void save(black, white); if (target.resultRevisionId) setReason("SIDES_SWAPPED"); }}><ArrowLeftRight size={17} />交换双方比分</button>}
      {!readOnly && target.resultRevisionId && <fieldset className="reason-options" disabled={busy}><legend>更正原因</legend>{([ ["SCORE_ENTRY_ERROR", "比分录错"], ["SIDES_SWAPPED", "双方填反"], ["REVERT_CORRECTION", "撤销上次更正"] ] as const).map(([id, label]) => <label key={id}><input type="radio" name="reason" checked={reason === id} onChange={() => setReason(id)} /><span>{label}</span></label>)}</fieldset>}
      {(error || view.errorCode) && <p className="form-error" role="alert">{error || view.message}</p>}
      </div>
      {!readOnly && <div className="dialog-footer"><button className="button primary" type="submit" disabled={busy || stale || view.status !== "synced" || !view.cacheReady || !!view.pending.length}><Check size={18} />{busy ? "正在保存…" : target.resultRevisionId ? "保存更正" : "确认最终比分"}</button></div>}
    </form>
  </section>;
}

export function scoreTarget(state: EventState, matchId: string): ScoreTarget {
  const match = state.matches.find(m => m.id === matchId)!;
  return { matchId, lineupRevisionId: match.activeLineupRevisionId!, resultRevisionId: match.activeResultRevisionId, generation: state.generation, participants: state.lineups.find(l => l.id === match.activeLineupRevisionId)!.participants };
}

