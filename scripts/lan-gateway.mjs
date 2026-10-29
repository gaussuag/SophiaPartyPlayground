import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";

const cookieName = "__sophia_lan_session";
const lifetimeMs = 8 * 60 * 60 * 1000;
const privateAddress = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const ipv4 = ip => ip.split(".").reduce((n, p) => ((n << 8) | Number(p)) >>> 0, 0);
const normalize = ip => ip?.replace(/^::ffff:/, "");
function equal(a, b) { return typeof a === "string" && /^[0-9a-f]{64}$/.test(a) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

/** A temporary LAN adapter to the unchanged loopback development server. */
export async function startLanGateway({ host, port = 5174, upstream = "http://127.0.0.1:5173", eventId, netmask = "255.255.255.0", root = process.cwd() }) {
  const target = new URL(upstream);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.username || target.password || target.pathname !== "/") throw new Error("Upstream must be a loopback HTTP origin.");
  if (!(privateAddress(host) || host === "127.0.0.1") || !/^local-[a-zA-Z0-9_-]{1,70}$/.test(eventId)) throw new Error("Use a private IPv4 address and an independent local-* event.");
  const instanceId = randomUUID();
  const pairToken = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + lifetimeMs;
  const sessions = new Set();
  const sockets = new Set();
  const attempts = new Map();
  let origin;
  const eventPath = `/api/events/${eventId}`;
  const eventUrl = `/?event=${eventId}`;
  const sameNetwork = peer => { const ip = normalize(peer); return ip === host || ip === "127.0.0.1" || privateAddress(ip ?? "") && (ipv4(ip) & ipv4(netmask)) === (ipv4(host) & ipv4(netmask)); };
  const paired = request => Date.now() < expiresAt && (request.headers.cookie ?? "").split(";").some(c => { const [name, value] = c.trim().split("="); return name === cookieName && sessions.has(value); });
  function answer(res, status, value, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers });
    res.end(typeof value === "string" ? value : JSON.stringify(value));
  }
  function check(request) {
    return request.headers.host === new URL(origin).host && sameNetwork(request.socket.remoteAddress)
      && (!request.headers.origin || request.headers.origin === origin) && request.headers["sec-fetch-site"] !== "cross-site";
  }
  function headersFor(request) {
    const headers = { ...request.headers, host: target.host };
    for (const key of Object.keys(headers)) if (/^(oai-authenticated-user-|x-forwarded-|forwarded$|cookie$|authorization$)/i.test(key)) delete headers[key];
    if (request.headers.origin) headers.origin = target.origin;
    if (paired(request)) headers.cookie = "__sites_local_auth=1";
    return headers;
  }
  function allowedAsset(rawPath) {
    let decoded;
    try { decoded = decodeURIComponent(rawPath).replaceAll("\\", "/"); } catch { return false; }
    const parts = decoded.split("/");
    if (decoded.includes("%") || decoded.includes("\0") || parts.includes("..") || parts.some(p => p.startsWith(".") && p !== ".vite")) return false;
    if (decoded.startsWith("/__sites_connector_preview")) return false;
    if (decoded.startsWith("/@fs/")) {
      const file = decoded.slice(5).replace(/^\/(?=[a-z]:)/i, "").toLowerCase();
      if (!file.startsWith(path.resolve(root).replaceAll("\\", "/").toLowerCase() + "/")) return false;
    }
    return true;
  }
  async function jsonBody(request) {
    let text = "";
    for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 1024) throw new Error("too large"); }
    return JSON.parse(text);
  }
  const server = http.createServer(async (request, response) => {
    // Drain small refused requests so later keep-alive requests are not stranded.
    const deny = (status, message) => { request.resume(); answer(response, status, { error: { message } }); };
    if (!check(request)) { deny(403, "仅接受当前 Wi-Fi 预览地址的同源请求"); return; }
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { deny(400, "地址无效"); return; }
    if (url.origin !== origin) { deny(403, "地址无效"); return; }
    if (url.pathname === "/__lan/status") { answer(response, 200, { application: "sophia-lan-preview", instanceId, eventId, expiresAt }); return; }
    if (url.pathname === "/__lan/stop") {
      if (request.method !== "POST" || normalize(request.socket.remoteAddress) !== host || request.headers["x-sophia-preview-instance"] !== instanceId) { deny(403, "请从开发机关闭入口"); return; }
      answer(response, 202, { stopping: true }); setTimeout(close, 100); return;
    }
    if (url.pathname === "/signin-with-chatgpt") { answer(response, 302, "", { Location: "/__lan/pair" }); return; }
    if (url.pathname === "/signout-with-chatgpt") {
      if (!["GET", "POST"].includes(request.method)) { deny(405, "方法不可用"); return; }
      for (const c of (request.headers.cookie ?? "").split(";")) { const [name, value] = c.trim().split("="); if (name === cookieName) sessions.delete(value); }
      answer(response, 302, "", { Location: eventUrl, "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` }); return;
    }
    if (url.pathname === "/__lan/pair") {
      if (request.method === "GET") {
        const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>进入 Sophia 手机演练</title><style>body{margin:0;background:#edf1df;color:#234e3b;font:16px system-ui;min-height:100dvh;display:grid;place-items:center}main{max-width:300px;padding:28px;text-align:center}h1{font-size:24px}p{line-height:1.7}a{color:inherit}</style><main><h1>手机演练</h1><p id="message">正在连接…</p><a href="${eventUrl}">先观赛</a></main><script type="module">const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState(null,'','/__lan/pair');const message=document.getElementById('message');if(!token){message.textContent='请使用电脑提供的专用操作体验链接。'}else{try{const r=await fetch('/__lan/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(r.ok)location.replace('${eventUrl}');else message.textContent='体验链接无效或已过期，请在电脑重新启动局域网预览。';}catch{message.textContent='连接中断，请保持与电脑在同一 Wi-Fi。';}}</script></html>`;
        answer(response, 200, html, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" }); return;
      }
      if (request.method !== "POST" || !request.headers["content-type"]?.startsWith("application/json")) { deny(400, "请求无效"); return; }
      const peer = normalize(request.socket.remoteAddress);
      const attempt = attempts.get(peer) ?? { count: 0, since: Date.now() };
      if (Date.now() - attempt.since > 60000) { attempt.count = 0; attempt.since = Date.now(); }
      attempts.set(peer, attempt);
      if (++attempt.count > 10) { deny(429, "请稍后重试"); return; }
      try {
        const body = await jsonBody(request);
        if (Date.now() >= expiresAt || !equal(body.token, pairToken)) { deny(401, "体验链接无效或已过期"); return; }
        const session = randomBytes(32).toString("hex"); sessions.add(session);
        answer(response, 200, { ready: true }, { "Set-Cookie": `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}` });
      } catch { deny(400, "请求无效"); }
      return;
    }
    if (url.pathname.startsWith("/api/") && url.pathname !== eventPath && !url.pathname.startsWith(eventPath + "/")) { deny(404, "此入口只开放指定的本地演练"); return; }
    if (url.pathname === "/callback" || !allowedAsset(url.pathname)) { deny(404, "没有此入口"); return; }
    if (url.pathname === "/" && url.searchParams.get("event") !== eventId) { answer(response, 302, "", { Location: eventUrl }); return; }
    if (!["GET", "HEAD"].includes(request.method)) {
      if (request.method !== "POST" || ![eventPath + "/commands", eventPath + "/restore"].includes(url.pathname)) { deny(405, "没有此操作"); return; }
      if (!paired(request)) { deny(401, "当前为观赛，请使用专用操作体验链接"); return; }
    }
    const proxy = http.request(new URL(url.pathname + url.search, target), { method: request.method, headers: headersFor(request), agent: false }, incoming => {
      const headers = { ...incoming.headers, "referrer-policy": "no-referrer", "cache-control": "no-store" };
      delete headers["set-cookie"];
      if (headers.location?.startsWith(target.origin)) headers.location = origin + headers.location.slice(target.origin.length);
      response.writeHead(incoming.statusCode ?? 502, headers); incoming.pipe(response);
    });
    proxy.on("error", () => { if (!response.headersSent) answer(response, 502, { error: { message: "开发预览未运行，请在电脑启动 npm run dev" } }); else response.destroy(); });
    request.on("aborted", () => proxy.destroy()); response.on("close", () => proxy.destroy()); request.pipe(proxy);
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.on("upgrade", (request, socket, head) => {
    if (!check(request) || request.headers["sec-websocket-protocol"] !== "vite-hmr") { socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    let url;
    try { url = new URL(request.url, origin); } catch { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
    if (url.origin !== origin || !["/", "/__vite_hmr"].includes(url.pathname)) { socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    const proxy = http.request(new URL(url.pathname + url.search, target), { headers: headersFor(request), agent: false });
    proxy.on("upgrade", (incoming, peer, initial) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${incoming.rawHeaders.reduce((s, v, i, a) => i % 2 ? s : s + v + ": " + a[i + 1] + "\r\n", "")}\r\n`);
      if (initial.length) socket.write(initial); if (head.length) peer.write(head);
      peer.pipe(socket); socket.pipe(peer); socket.on("close", () => peer.destroy()); peer.on("error", () => socket.destroy());
    });
    proxy.on("response", res => { socket.end(`HTTP/1.1 ${res.statusCode} Rejected\r\n\r\n`); res.resume(); });
    proxy.on("error", () => socket.destroy()); socket.on("error", () => proxy.destroy()); proxy.end();
  });
  function close() { sessions.clear(); server.close(); for (const socket of sockets) socket.destroy(); }
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host, port }, resolve); });
  origin = `http://${host}:${server.address().port}`;
  return { server, close, instanceId, eventId, expiresAt, origin, viewerUrl: origin + eventUrl, operatorUrl: origin + "/__lan/pair#token=" + pairToken };
}
