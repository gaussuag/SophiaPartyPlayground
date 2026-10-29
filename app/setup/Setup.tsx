"use client";
import { useEffect, useState } from "react";
import { SITE_TITLE } from "../../src/config/event";
import "./setup.css";

type Identity = { authenticated: boolean; actorId: string | null; email: string | null; role: "viewer" | "operator" | "admin"; initializationEnabled: boolean; targets: { eventId: string; label: string }[] };
type ApiError = { error?: { message?: string } };
type InitializationResult = ApiError & { created: boolean; state: { id: string; revision: number; results: unknown[] } };
export function Setup({ eventId }: { eventId?: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = eventId ? "?event=" + encodeURIComponent(eventId) : "";
  const authReturn = encodeURIComponent("/setup" + query);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/setup", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as Identity & ApiError;
      if (!response.ok) throw new Error(data.error?.message ?? "暂时无法读取本站身份");
      setIdentity(data);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);
  async function initialize(eventId: string) {
    if (!confirmed || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, confirmName: SITE_TITLE }) });
      const data = await response.json() as InitializationResult;
      if (!response.ok) throw new Error(data.error?.message ?? "无法确认初始化结果，请核对后重试");
      setMessage(`${data.created ? "已创建" : "已有活动，记录保持不变"}：${data.state.id}，版本 ${data.state.revision}，${data.state.results.length} 条赛果版本。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法确认初始化结果，请核对后重试"); }
    finally { setBusy(false); }
  }
  return <main className="setup-page"><a href={"/" + query} target="_top">返回球馆</a><h1>{SITE_TITLE}</h1><h2>身份与活动准备</h2>
    {!identity ? <p role="status">{message || "正在核对身份…"}</p> : <>
      <section><h3>本站身份</h3>{!identity.authenticated ? <><p>球馆公开可看。管理操作需要登录并获得授权。</p><a className="button primary" href={"/signin-with-chatgpt?return_to=" + authReturn} target="_top">使用 ChatGPT 登录</a></> : <><p>{identity.email}</p><p>权限：{identity.role === "admin" ? "管理员" : identity.role === "operator" ? "操作员" : "只读"}</p><code>{identity.actorId}</code><p>这是当前站点的身份 ID。请交给站点所有者核对后配置授权；登录本身不会取得写权限。</p><a href={"/signout-with-chatgpt?return_to=" + authReturn} target="_top">退出登录</a></>}</section>
      {identity.role === "admin" && <section><h3>受控初始化</h3>{!identity.initializationEnabled ? <p>初始化窗口已关闭。部署和刷新不会重建活动。</p> : <><label className="setup-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />确认只补建缺失活动，保留已有记录</label>{identity.targets.map(target => <button className="button secondary" key={target.eventId} disabled={!confirmed || busy} onClick={() => void initialize(target.eventId)}>{busy ? "正在核对…" : "补建／核对"}{target.label}</button>)}</>}</section>}
      {message && <p className="setup-feedback" role="status">{message}</p>}
    </>}
  </main>;
}
