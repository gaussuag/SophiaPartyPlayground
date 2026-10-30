import type { CompetitionCommand, EventState } from "../competition";
import type { Backup, CommandEnvelope, PendingEnvelope, Role } from "../records/protocol";
import { localCache, type ScoreDraft } from "./cache";
import { commandId } from "./command-id";
import { canExecute } from "../records/permissions";
export type { ScoreDraft } from "./cache";
export type SyncStatus = "loading" | "synced" | "saving" | "offline" | "conflict" | "unknown-outcome";
export type SessionView = { state: EventState | null; role: Role; status: SyncStatus; message: string; errorCode: string | null; lastSyncedAt: string | null; pending: PendingEnvelope[]; drafts: Record<string, ScoreDraft>; notFound: boolean; cacheReady: boolean };
type Options = { fetch?: typeof fetch; intervalMs?: number; timeoutMs?: number };
type ReadResponse = { state: EventState; role: Role };
const initial: SessionView = { state: null, role: "viewer", status: "loading", message: "正在连接活动记录", errorCode: null, lastSyncedAt: null, pending: [], drafts: {}, notFound: false, cacheReady: false };
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

/** A session owns uncertainty, polling, and local drafts. Views only use confirmed facts. */
export function connect(eventId: string, options: Options = {}) {
  const cache = localCache(eventId);
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  let view: SessionView = { ...initial };
  let disposed = false; let syncing = false; let sending = false; let etag: string | null = null;
  const listeners = new Set<() => void>();
  const emit = (change: Partial<SessionView>) => { view = { ...view, ...change }; if (!disposed) listeners.forEach(l => l()); };
  const base = `/api/events/${encodeURIComponent(eventId)}`;
  const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
  const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  async function request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
    try { return await transport(path, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin" }); } finally { clearTimeout(timer); }
  }
  async function data<T = ReadResponse>(response: Response): Promise<T> {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    if (!response.ok) throw new HttpError(response.status, body.error?.code ?? "HTTP_ERROR", body.error?.message ?? "无法连接活动记录");
    return body as T;
  }
  async function accept(incoming: ReadResponse) {
    if (incoming.state.id !== eventId) throw new Error("服务器返回了不同活动");
    if (view.state && incoming.state.revision < view.state.revision) return;
    const restored = view.state && incoming.state.generation !== view.state.generation;
    const lastSyncedAt = new Date().toISOString();
    emit({ state: incoming.state, role: incoming.role, lastSyncedAt, notFound: false, ...(restored ? { status: "conflict" as const, errorCode: "RESTORE_RELOAD_REQUIRED", message: "活动已从备份恢复，请重新核对；旧操作不会自动重放" } : {}) });
    try { await cache.saveSnapshot(incoming.state); await cache.saveSyncTime(lastSyncedAt); } catch { emit({ message: "已读取共享记录；本机缓存暂时不可用" }); }
  }
  async function refresh(acknowledge = false) {
    if (disposed || syncing || !isVisible()) return;
    if (!isOnline()) { emit({ status: view.pending.length ? "unknown-outcome" : "offline", message: "离线，显示最后同步记录；比分草稿保留在本机" }); return; }
    syncing = true;
    try {
      const response = await request(base, { headers: etag ? { "If-None-Match": etag } : {} });
      if (response.status !== 304) { const incoming = await data(response) as ReadResponse; await accept(incoming); etag = response.headers.get("ETag"); }
      else { const lastSyncedAt = new Date().toISOString(); emit({ lastSyncedAt }); void cache.saveSyncTime(lastSyncedAt).catch(() => {}); }
      const needsReview = view.status === "conflict" || !!view.errorCode && !["NETWORK_ERROR", "UNKNOWN_OUTCOME"].includes(view.errorCode);
      if (!sending && !view.pending.length && (acknowledge || !needsReview)) emit({ status: "synced", message: "已同步", errorCode: null });
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) emit({ notFound: true, status: "offline", message: error.message, errorCode: error.code });
      else emit({ status: view.pending.length ? "unknown-outcome" : "offline", message: view.pending.length ? "正在核对提交结果，保留原操作编号" : "连接中断，显示最后同步记录", errorCode: error instanceof HttpError ? error.code : "NETWORK_ERROR" });
    } finally { syncing = false; }
  }
  async function clearPending(commandId: string) { await cache.clearPending(commandId); emit({ pending: view.pending.filter(p => p.commandId !== commandId) }); }
  async function reconcile() {
    if (sending || !view.pending.length || !isOnline()) return;
    // Read receipts and fresh state before any retry. No automatic resubmission.
    etag = null; await refresh();
    for (const envelope of [...view.pending]) {
      try {
        const result = await data<{ receipt: { appliedRevision: number; status: string } | null }>(await request(`${base}/receipts/${encodeURIComponent(envelope.commandId)}`));
        if (result.receipt) {
          await clearPending(envelope.commandId);
          if (result.receipt.status === "SUPERSEDED_BY_RESTORE") emit({ status: "conflict", errorCode: "RESTORE_RELOAD_REQUIRED", message: "原操作已被备份恢复替代，请重新核对" });
          else { etag = null; await refresh(); if (view.state && view.state.revision >= result.receipt.appliedRevision && view.status !== "conflict") emit({ status: "synced", message: "已核对：原操作保存成功", errorCode: null }); }
        } else if (view.state && (view.state.generation !== envelope.expectedGeneration || view.state.revision !== envelope.expectedRevision)) {
          await clearPending(envelope.commandId); emit({ status: "conflict", message: "原操作未取得回执，记录已有变化；请核对后重新操作", errorCode: "REVISION_CONFLICT" });
        } else emit({ status: "unknown-outcome", message: "尚未查到原操作回执，可核对后使用原编号重试" });
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) { await clearPending(envelope.commandId); emit({ status: "conflict", message: error.message, errorCode: error.code }); }
        else emit({ status: "unknown-outcome", message: "暂时无法核对提交结果，请保留输入并恢复连接" });
      }
    }
  }
  async function send(envelope: PendingEnvelope): Promise<boolean> {
    if (sending) return false;
    sending = true; emit({ status: "saving", message: "正在保存，请稍候", errorCode: null });
    try {
      const restore = "restore" in envelope;
      const payload = restore ? { ...envelope.restore, commandId: envelope.commandId, expectedRevision: envelope.expectedRevision, expectedGeneration: envelope.expectedGeneration } : envelope;
      const result = await data(await request(`${base}/${restore ? "restore" : "commands"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      await accept(result); await clearPending(envelope.commandId);
      emit({ status: "synced", message: "已同步", errorCode: null }); return true;
    } catch (error) {
      if (error instanceof HttpError && error.status < 500) {
        await clearPending(envelope.commandId);
        emit({ status: error.status === 409 ? "conflict" : "synced", message: error.message, errorCode: error.code });
        if (error.status === 409) { etag = null; await refresh(); }
      } else emit({ status: "unknown-outcome", message: "暂未确认保存结果，请核对原操作回执", errorCode: "UNKNOWN_OUTCOME" });
      return false;
    } finally { sending = false; }
  }
  async function dispatch(command: CompetitionCommand, basis?: Pick<EventState, "revision" | "generation">): Promise<boolean> {
    if (!view.state || !canExecute(view.role, command.type) || !view.cacheReady || sending || view.pending.length || ["offline", "conflict", "loading"].includes(view.status) || !isOnline()) {
      emit({ message: !canExecute(view.role, command.type) ? "此操作需要相应的活动权限" : view.pending.length ? "请先核对上一操作的保存结果" : "请先同步并核对当前记录" }); return false;
    }
    const envelope: CommandEnvelope = { eventId, commandId: commandId(), expectedRevision: basis?.revision ?? view.state.revision, expectedGeneration: basis?.generation ?? view.state.generation, command };
    try { await cache.savePending(envelope); }
    catch { emit({ errorCode: "LOCAL_STORAGE_UNAVAILABLE", message: "无法保留操作编号，本次尚未发送，请恢复本机存储后重试" }); return false; }
    emit({ pending: [...view.pending, envelope] });
    return send(envelope);
  }
  async function saveDraft(draft: ScoreDraft) {
    emit({ drafts: { ...view.drafts, [draft.matchId]: draft } });
    try { await cache.saveDraft(draft); } catch { emit({ message: "本机草稿暂时无法持久保存，请保持页面打开", errorCode: "DRAFT_STORAGE_UNAVAILABLE" }); }
  }
  async function restore(backup: Backup): Promise<boolean> {
    if (!view.state || view.role !== "admin" || view.status !== "synced" || !view.cacheReady || sending || view.pending.length || !isOnline()) return false;
    const envelope: PendingEnvelope = { eventId, commandId: commandId(), expectedRevision: view.state.revision, expectedGeneration: view.state.generation, restore: { confirmEventId: eventId, maintenance: true, backup } };
    try { await cache.savePending(envelope); } catch { emit({ message: "无法保留恢复操作编号，本次未发送", errorCode: "LOCAL_STORAGE_UNAVAILABLE" }); return false; }
    emit({ pending: [...view.pending, envelope] }); return send(envelope);
  }
  async function clearDraft(matchId: string) {
    const drafts = { ...view.drafts }; delete drafts[matchId]; emit({ drafts });
    try { await cache.clearDraft(matchId); } catch { emit({ message: "赛果已同步；本机旧草稿未能清除，重开时请核对", errorCode: "DRAFT_STORAGE_UNAVAILABLE" }); }
  }
  const onNetwork = () => { if (isOnline()) { void refresh().then(reconcile); } else emit({ status: view.pending.length ? "unknown-outcome" : "offline", message: "离线，比分草稿保留在本机" }); };
  const onVisibility = () => { if (isVisible()) void refresh().then(reconcile); };
  if (typeof window !== "undefined") { window.addEventListener("online", onNetwork); window.addEventListener("offline", onNetwork); document.addEventListener("visibilitychange", onVisibility); }
  const interval = setInterval(() => { if (isVisible() && !sending) void refresh().then(() => view.pending.length ? reconcile() : undefined); }, options.intervalMs ?? 2000);
  const ready = (async () => {
    try {
      const [state, pending, drafts, lastSyncedAt] = await Promise.all([cache.snapshot(), cache.pending(), cache.drafts(), cache.lastSyncedAt()]);
      emit({ state: view.state ?? state ?? null, lastSyncedAt: view.lastSyncedAt ?? lastSyncedAt ?? null, pending, drafts: Object.fromEntries(drafts.map(d => [d.matchId, d])), cacheReady: true });
    } catch { emit({ cacheReady: false, message: "本机缓存不可用，仍可查看共享记录", errorCode: "LOCAL_STORAGE_UNAVAILABLE" }); }
    await refresh(); await reconcile();
  })();
  return {
    ready, getView: () => view, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); }, dispatch,
    refresh: async () => { etag = null; await refresh(true); await reconcile(); },
    retryPending: async () => { await reconcile(); const envelope = view.pending[0]; return envelope && view.state?.revision === envelope.expectedRevision && view.state.generation === envelope.expectedGeneration && isOnline() ? send(envelope) : false; },
    saveDraft, clearDraft, restore,
    dispose: () => { disposed = true; clearInterval(interval); listeners.clear(); cache.close(); if (typeof window !== "undefined") { window.removeEventListener("online", onNetwork); window.removeEventListener("offline", onNetwork); document.removeEventListener("visibilitychange", onVisibility); } },
  };
}
export type EventSession = ReturnType<typeof connect>;
