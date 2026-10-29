import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One conditional write commits business records, audit, and receipts together.
export const events = sqliteTable("events", {
  eventId: text("event_id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  revision: integer("revision").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
