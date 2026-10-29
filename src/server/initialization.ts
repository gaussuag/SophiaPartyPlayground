import { z } from "zod";
import { ACCEPTANCE_EVENT_ID, PRODUCTION_EVENT_ID, SITE_TITLE } from "../config/event";
import { initializeEvent, RecordsError, type RecordsContext } from "../modules/records";

type ReleaseEnvironment = { EVENT_ID?: string; ACCEPTANCE_EVENT_ID?: string; INITIALIZATION_ENABLED?: string };
export function initializationConfiguration(env: ReleaseEnvironment) {
  const eventId = env.EVENT_ID?.trim() || PRODUCTION_EVENT_ID;
  const acceptanceEventId = env.ACCEPTANCE_EVENT_ID?.trim() || ACCEPTANCE_EVENT_ID;
  const valid = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id) && !id.startsWith("local-");
  if (!valid(eventId) || !valid(acceptanceEventId) || eventId === acceptanceEventId) throw new RecordsError("INVALID_RELEASE_CONFIGURATION", "正式活动与隔离验收活动必须使用不同的有效编号", 503);
  return { enabled: env.INITIALIZATION_ENABLED === "true", targets: [{ eventId, name: SITE_TITLE, label: "正式活动" }, { eventId: acceptanceEventId, name: SITE_TITLE + " · 发布验收", label: "隔离验收活动" }] };
}

const requestSchema = z.object({ eventId: z.string(), confirmName: z.literal(SITE_TITLE) }).strict();
export async function initializeConfiguredEvent(context: RecordsContext, config: ReturnType<typeof initializationConfiguration>, input: unknown) {
  if (!config.enabled) throw new RecordsError("NOT_FOUND", "初始化窗口未开放", 404);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new RecordsError("INVALID_REQUEST", "请明确确认本站名称，只能补建预先配置的活动");
  const target = config.targets.find(t => t.eventId === parsed.data.eventId);
  if (!target) throw new RecordsError("EVENT_NOT_CONFIGURED", "此活动不在本站初始化名单中", 403);
  // records enforces admin authorization and INSERT ... DO NOTHING against real D1.
  return initializeEvent(context, target.eventId, { name: target.name });
}
