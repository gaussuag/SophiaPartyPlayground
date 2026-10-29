import { env } from "cloudflare:workers";
import { initializationConfiguration, initializeConfiguredEvent } from "../../../src/server/initialization";
import { body, contextFor, discardBody, json, route } from "../_server";

export async function GET(request: Request) {
  return route(async () => {
    const context = contextFor(request);
    const config = context.role === "admin" && env.INITIALIZATION_ENABLED === "true" ? initializationConfiguration(env) : null;
    return json({ authenticated: !!context.actorId, actorId: context.actorId, email: context.actorId ? request.headers.get("oai-authenticated-user-email") : null, role: context.role, initializationEnabled: config?.enabled ?? false, targets: config?.enabled ? config.targets : [] });
  });
}
export async function POST(request: Request) {
  if (env.INITIALIZATION_ENABLED !== "true") {
    await discardBody(request);
    return json({ error: { code: "NOT_FOUND", message: "初始化窗口未开放" } }, 404);
  }
  return route(async () => {
    const input = await body(request);
    return json(await initializeConfiguredEvent(contextFor(request), initializationConfiguration(env), input));
  });
}
