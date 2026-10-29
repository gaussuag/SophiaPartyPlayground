import { env } from "cloudflare:workers";
import { RecordsError, type RecordsContext, type Role } from "../../src/modules/records";

export function contextFor(request: Request): RecordsContext {
  if (!env.DB) throw new RecordsError("DATABASE_UNAVAILABLE", "共享数据库尚未配置", 503);
  const url = new URL(request.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const identityTrusted = import.meta.env.DEV || !loopback && env.IDENTITY_SOURCE === "sites-dispatch";
  const actorId = identityTrusted ? request.headers.get("oai-authenticated-user-id") : null;
  const ids = (value: string | undefined) => (value ?? "").split(",").map(s => s.trim()).filter(Boolean);
  let role: Role = "viewer";
  if (actorId && ids(env.OPERATOR_IDS).includes(actorId)) role = "operator";
  if (actorId && ids(env.ADMIN_IDS).includes(actorId)) role = "admin";
  // Vite removes this branch from the production Worker. The starter strips
  // caller-supplied identity headers before injecting its loopback mock identity.
  if (import.meta.env.DEV && loopback && actorId === "local_seedy") role = "admin";
  return { db: env.DB, actorId, role, now: new Date().toISOString() };
}
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", ...headers } });
}
export async function route(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (e) {
    if (e instanceof RecordsError) return json({ error: { code: e.code, message: e.message, revision: e.revision } }, e.status);
    console.error("Sophia records failure", e instanceof Error ? e.message : "unknown");
    return json({ error: { code: "STORAGE_UNAVAILABLE", message: "暂时无法确认保存结果，请保留输入并核对原操作回执" } }, 503);
  }
}
export async function body(request: Request, maxBytes = 16384) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") { await discardBody(request); throw new RecordsError("CROSS_ORIGIN_WRITE", "不接受跨站修改", 403); }
  if (!request.headers.get("content-type")?.startsWith("application/json")) { await discardBody(request); throw new RecordsError("INVALID_REQUEST", "请使用 JSON 请求"); }
  if (Number(request.headers.get("content-length")) > maxBytes) { await discardBody(request); throw new RecordsError("REQUEST_TOO_LARGE", "请求过大", 413); }
  const reader = request.body?.getReader();
  if (!reader) throw new RecordsError("INVALID_REQUEST", "请求为空");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new RecordsError("REQUEST_TOO_LARGE", "请求过大", 413); } chunks.push(chunk.value); }
  const joined = new Uint8Array(bytes); let offset = 0; for (const c of chunks) { joined.set(c, offset); offset += c.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(joined)); } catch { throw new RecordsError("INVALID_JSON", "JSON 格式无效"); }
}
export async function discardBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return;
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); break; }
    }
  } catch { /* The disabled route remains unavailable after a broken upload. */ }
  finally { reader.releaseLock(); }
}
