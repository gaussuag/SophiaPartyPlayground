import { readReceipt } from "../../../../../../src/modules/records";
import { contextFor, json, route } from "../../../../_server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string; commandId: string }> }) {
  return route(async () => { const { eventId, commandId } = await params; const receipt = await readReceipt(contextFor(request), eventId, commandId); return json({ receipt }); });
}
