import { execute, RecordsError } from "../../../../../src/modules/records";
import { body, contextFor, json, route } from "../../../_server";
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return route(async () => { const data = await body(request); if (data.eventId !== (await params).eventId) throw new RecordsError("INVALID_REQUEST", "活动身份不匹配"); return json(await execute(contextFor(request), data)); });
}
