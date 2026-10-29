import { restoreEvent } from "../../../../../src/modules/records";
import { body, contextFor, json, route } from "../../../_server";
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return route(async () => json(await restoreEvent(contextFor(request), (await params).eventId, await body(request, 2 * 1024 * 1024))));
}
