import { networkInterfaces } from "node:os";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { startLanGateway } from "./lan-gateway.mjs";

const stateFile = path.resolve(".sites-runtime/lan-preview.json");
const args = process.argv.slice(2);
const argument = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) => (entries ?? []).filter(a => a.family === "IPv4" && !a.internal).map(a => ({ name, ...a })));
if (args.includes("--stop")) {
  let current;
  try { current = JSON.parse(await readFile(stateFile, "utf8")); } catch { console.log("No managed LAN preview."); process.exit(0); }
  const url = new URL(current.origin);
  if (url.protocol !== "http:" || !addresses.some(a => a.address === url.hostname)) throw new Error("The saved LAN address is no longer on this computer. Stop the original preview terminal.");
  const status = await fetch(url.origin + "/__lan/status", { signal: AbortSignal.timeout(3000) }).then(r => r.json());
  if (status.application !== "sophia-lan-preview" || status.instanceId !== current.instanceId) throw new Error("This port belongs to a different process; it will not be stopped.");
  const response = await fetch(url.origin + "/__lan/stop", { method: "POST", headers: { "x-sophia-preview-instance": current.instanceId }, signal: AbortSignal.timeout(3000) });
  if (response.status !== 202) throw new Error("Preview did not confirm shutdown.");
  await response.text();
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { await fetch(url.origin + "/__lan/status", { signal: AbortSignal.timeout(500) }); }
    catch { console.log("LAN preview stopped. The loopback development server and database are retained."); process.exit(0); }
  }
  throw new Error("Shutdown was requested but is not yet confirmed.");
} else {
  const host = argument("--host", addresses.find(a => /wi-?fi|wlan/i.test(a.name))?.address);
  const network = addresses.find(a => a.address === host);
  if (!network) throw new Error("Pass --host with this computer's Wi-Fi IPv4 address (ipconfig).");
  const port = Number(argument("--port", "5174"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid LAN port.");
  const eventId = argument("--event", "local-iphone");
  if (!/^local-[a-zA-Z0-9_-]{1,70}$/.test(eventId)) throw new Error("Use a local-* rehearsal event.");
  const upstream = "http://127.0.0.1:5173";
  const signIn = await fetch(upstream + "/signin-with-chatgpt?return_to=/", { redirect: "manual", signal: AbortSignal.timeout(10000) });
  const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
  if (!cookie?.startsWith("__sites_local_auth=")) throw new Error("Start npm run dev first. A production server cannot provide development identity.");
  const current = await fetch(upstream + "/api/events/" + eventId, { headers: { cookie }, signal: AbortSignal.timeout(10000) });
  if (current.status === 404) {
    const created = await fetch(upstream + "/api/local/initialize", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ eventId }), signal: AbortSignal.timeout(10000) });
    if (!created.ok) throw new Error("Unable to create the independent phone rehearsal.");
    await created.text();
  } else if (!current.ok || (await current.json()).role !== "admin") throw new Error("The loopback development identity is unavailable.");
  const gateway = await startLanGateway({ host, port, eventId, upstream, netmask: network.netmask });
  const mask = network.netmask.split(".").map(Number);
  const networkAddress = host.split(".").map((n, i) => Number(n) & mask[i]).join(".");
  const prefix = mask.reduce((sum, n) => sum + n.toString(2).replaceAll("0", "").length, 0);
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify({ origin: gateway.origin, eventId, instanceId: gateway.instanceId, pid: process.pid, expiresAt: gateway.expiresAt, interfaceAlias: network.name, remoteSubnet: `${networkAddress}/${prefix}` }, null, 2));
  gateway.server.on("close", async () => {
    try { const saved = JSON.parse(await readFile(stateFile, "utf8")); if (saved.instanceId === gateway.instanceId) await unlink(stateFile); } catch { /* No metadata belongs to this process anymore. */ }
  });
  process.on("SIGINT", gateway.close); process.on("SIGTERM", gateway.close);
  // The pairing capability stays in process memory and terminal output, not files.
  console.log(JSON.stringify({ ready: true, viewerUrl: gateway.viewerUrl, operatorUrl: gateway.operatorUrl, expiresAt: new Date(gateway.expiresAt).toISOString(), network: { address: host, netmask: network.netmask }, stop: "npm run dev:lan:stop" }, null, 2));
}
