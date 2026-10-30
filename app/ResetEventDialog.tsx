"use client";
import { useState } from "react";
import type { EventSession, SessionView } from "../src/modules/session";
import type { SelectionBasis } from "../src/modules/venue";
import { ConfirmDialog } from "./ConfirmDialog";
export function ResetEventDialog({ session, view, basis, onClose, onComplete }: { session: EventSession; view: SessionView; basis: SelectionBasis; onClose: () => void; onComplete: () => void }) {
  const [error, setError] = useState("");
  const state = view.state!, busy = view.status === "saving" || !!view.pending.length;
  return <ConfirmDialog title="重置全部比赛数据" actionLabel="确认清空并重新开始" busy={busy} onClose={() => { if (!busy) onClose(); }} onConfirm={async () => {
    if (await session.reset(basis)) onComplete(); else setError(session.getView().message || "请先同步并核对记录");
  }}>
    <p><strong>{state.name}</strong></p>
    <p>清空全部 {state.rounds.length} 轮的阵容、比分和积分，回到未开始状态。</p>
    <p>保留名单、赛程和操作记录。服务端自动保存重置前备份，可从「赛果 → 活动备份」下载并恢复。</p>
    <p className="muted">此操作影响所有设备；确认期间有新记录时会停止重置。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </ConfirmDialog>;
}
