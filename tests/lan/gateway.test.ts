import http, { type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it } from "vitest";
import { startLanGateway } from "../../scripts/lan-gateway.mjs";

let upstream: Server;
let gateway: Awaited<ReturnType<typeof startLanGateway>>;
const seen: { path?: string; cookie?: string; identity?: string; origin?: string } = {};
beforeEach(async () => {
  upstream = http.createServer((request, response) => {
    request.resume();
    Object.assign(seen, { path: request.url, cookie: request.headers.cookie, identity: request.headers["oai-authenticated-user-id"], origin: request.headers.origin });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ role: request.headers.cookie === "__sites_local_auth=1" ? "admin" : "viewer" }));
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const address = upstream.address(); if (!address || typeof address === "string") throw new Error("Missing port");
  gateway = await startLanGateway({ host: "127.0.0.1", port: 0, upstream: `http://127.0.0.1:${address.port}`, eventId: "local-phone-test" });
});
afterEach(async () => {
  gateway?.close(); upstream?.closeAllConnections();
  if (upstream?.listening) await new Promise<void>(resolve => upstream.close(() => resolve()));
});
const eventPath = "/api/events/local-phone-test";
async function pair() {
  const token = new URL(gateway.operatorUrl).hash.slice("#token=".length);
  const response = await fetch(gateway.origin + "/__lan/pair", { method: "POST", headers: { "Content-Type": "application/json", origin: gateway.origin }, body: JSON.stringify({ token }) });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
it("keeps an unpaired phone read-only and strips forged development credentials", async () => {
  const response = await fetch(gateway.origin + eventPath, { headers: { cookie: "__sites_local_auth=1", "oai-authenticated-user-id": "local_seedy" } });
  expect(await response.json()).toEqual({ role: "viewer" });
  expect(seen.cookie).toBeUndefined(); expect(seen.identity).toBeUndefined();
  expect((await fetch(gateway.origin + eventPath + "/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
});
it("pairs explicitly, preserves same-origin checks, and revokes logout", async () => {
  const cookie = await pair();
  const write = await fetch(gateway.origin + eventPath + "/commands", { method: "POST", headers: { cookie, origin: gateway.origin, "Content-Type": "application/json" }, body: "{}" });
  expect(await write.json()).toEqual({ role: "admin" });
  expect(seen.origin).not.toBe(gateway.origin); expect(seen.cookie).toBe("__sites_local_auth=1");
  expect((await fetch(gateway.origin + eventPath + "/commands", { method: "POST", headers: { cookie, origin: "https://other.invalid" }, body: "{}" })).status).toBe(403);
  await fetch(gateway.origin + "/signout-with-chatgpt", { headers: { cookie }, redirect: "manual" });
  const read = await fetch(gateway.origin + eventPath, { headers: { cookie } }); expect(await read.json()).toEqual({ role: "viewer" });
});
it("rejects invalid pairing and access outside the rehearsal", async () => {
  const bad = await fetch(gateway.origin + "/__lan/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "0".repeat(64) }) });
  expect(bad.status).toBe(401);
  const cookie = await pair();
  for (const route of ["/api/events/local-sophia", "/api/local/initialize", "/.dev.vars", "/.wrangler/state/test", "/@fs/C:/Users/private.txt", "/__sites_connector_preview/context"]) {
    expect((await fetch(gateway.origin + route, { headers: { cookie } })).status, route).toBe(404);
  }
});
it("never proxies absolute-form request targets to another server", async () => {
  const address = gateway.server.address(); if (!address || typeof address === "string") throw new Error("Missing port");
  const status = await new Promise(resolve => {
    const request = http.request({ hostname: "127.0.0.1", port: address.port, path: "http://other.invalid/api/events/local-phone-test", headers: { host: new URL(gateway.origin).host } }, response => { response.resume(); resolve(response.statusCode); });
    request.on("error", () => resolve(0)); request.end();
  });
  expect(status).toBe(403);
});
