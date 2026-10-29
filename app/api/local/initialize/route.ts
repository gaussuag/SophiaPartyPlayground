import { initializeEvent, RecordsError } from "../../../../src/modules/records";
import { body, contextFor, discardBody, json, route } from "../../_server";
export async function POST(request: Request) {
  if (!import.meta.env.DEV) {
    await discardBody(request);
    return json({ error: { code: "NOT_FOUND", message: "没有此入口" } }, 404);
  }
  return route(async () => { const data = await body(request); if (!String(data.eventId).startsWith("local-")) throw new RecordsError("LOCAL_EVENT_REQUIRED", "本地演练编号必须以 local- 开头"); return json(await initializeEvent(contextFor(request), data.eventId)); });
}
