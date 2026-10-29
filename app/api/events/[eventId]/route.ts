import { readEvent } from "../../../../src/modules/records";
import { contextFor, json, route } from "../../_server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return route(async () => {
    const { eventId } = await params;
    const view = await readEvent(contextFor(request), eventId);
    const etag = `"${view.state.generation}-${view.state.revision}-${view.role}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-store", Vary: "Cookie" } });
    return json(view, 200, { ETag: etag });
  });
}
