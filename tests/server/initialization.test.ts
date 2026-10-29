import { describe, expect, it } from "vitest";
import { ACCEPTANCE_EVENT_ID, PRODUCTION_EVENT_ID, SITE_TITLE } from "../../src/config/event";
import { initializationConfiguration } from "../../src/server/initialization";

describe("release configuration", () => {
  it("starts with a closed window and two explicitly named, independent activities", () => {
    const config = initializationConfiguration({});
    expect(config.enabled).toBe(false);
    expect(config.targets.map(t => t.eventId)).toEqual([PRODUCTION_EVENT_ID, ACCEPTANCE_EVENT_ID]);
    expect(config.targets[0].name).toBe(SITE_TITLE);
    expect(initializationConfiguration({ INITIALIZATION_ENABLED: "false" }).enabled).toBe(false);
  });
  it("rejects shared IDs, local rehearsals and malformed production identifiers", () => {
    for (const env of [{ EVENT_ID: "same", ACCEPTANCE_EVENT_ID: "same" }, { EVENT_ID: "local-iphone" }, { ACCEPTANCE_EVENT_ID: "local-rehearsal" }, { EVENT_ID: "invalid/id" }]) {
      expect(() => initializationConfiguration(env)).toThrow("正式活动与隔离验收活动必须使用不同的有效编号");
    }
  });
});
