import { readEvent, resultsCsv } from "../../../../../src/modules/records";
import { contextFor, route } from "../../../_server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return route(async () => { const { eventId } = await params; const { state } = await readEvent(contextFor(request), eventId); return new Response(resultsCsv(state), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${eventId}-r${state.revision}.csv"` } }); });
}
