import { exportEvent } from "../../../../../src/modules/records";
import { contextFor, json, route } from "../../../_server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return route(async () => {
    const { eventId } = await params;
    const backup = await exportEvent(contextFor(request), eventId, new URL(request.url).searchParams.has("beforeRestore"));
    return json(backup, 200, { "Content-Disposition": `attachment; filename="${eventId}-r${backup.revision}.json"` });
  });
}
