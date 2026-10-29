"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import type { EventSession, SessionView } from "../src/modules/session";
import type { Backup } from "../src/modules/records/protocol";
import { ConfirmDialog } from "./ConfirmDialog";
export function AdminTools({ session, view }: { session: EventSession; view: SessionView }) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [error, setError] = useState("");
  const state = view.state!;
  return <section className="admin-tools"><h3>活动备份</h3><p className="muted">JSON 保存完整记录；CSV 用于分享每场赛果。</p><div className="export-buttons"><a className="button secondary" href={`/api/events/${state.id}/backup`} download><Download size={17} />下载 JSON 备份</a><a className="button secondary" href={`/api/events/${state.id}/backup?beforeRestore=1`} download>恢复前备份</a><label className="button secondary file-button"><Upload size={17} />从备份恢复<input type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw new Error("备份文件超过 2 MB"); const candidate = JSON.parse(await file.text()) as Backup; if (candidate.format !== "sophia-party-backup-v1" || candidate.eventId !== state.id || candidate.aggregate?.state?.id !== state.id) throw new Error("请选择同一活动的完整 JSON 备份"); setBackup(candidate); setError(""); setMaintenance(false); } catch (e) { setError(e instanceof Error ? e.message : "备份无法读取"); } }} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}
    {backup && <ConfirmDialog title="维护恢复：请核对活动" actionLabel="确认恢复此活动" busy={view.status === "saving"} onClose={() => setBackup(null)} onConfirm={async () => { if (!maintenance) { setError("请先让所有操作员暂停写入，并勾选维护确认"); return; } if (await session.restore(backup)) { setBackup(null); setError(""); } }}><p>活动 <strong>{backup.eventId}</strong></p><p>当前版本 {state.revision} → 恢复备份版本 {backup.revision} 的比赛记录，保存后版本仍递增。</p><p>服务端会原子保留恢复前备份；其他设备需要重新核对。</p><label className="maintenance-check"><input type="checkbox" checked={maintenance} onChange={e => setMaintenance(e.target.checked)} />我已让所有操作员暂停修改，进入维护窗口</label>{error && <p className="form-error">{error}</p>}</ConfirmDialog>}
  </section>;
}
