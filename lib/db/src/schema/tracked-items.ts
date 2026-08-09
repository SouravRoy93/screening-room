// Source-of-truth mirror of the live Supabase table `public.tracked_items`.
// The table itself is managed in Supabase (with owner-only RLS:
//   using (user_id = auth.uid()) with check (user_id = auth.uid())
// on ALL commands for role `authenticated`).
// Keep this file in sync with any dashboard changes so schema is versioned.
//
// The canonical DDL now lives in scripts/sql/bootstrap.sql — apply that to a
// fresh project and this file describes what you get.
//
// `tmdb_id` was bigint until the database was rebuilt from scratch (the
// original project was lost with its GitHub-linked account). It is text now,
// which is what lets Google live-search results — whose place ids are strings
// — sync to the cloud instead of staying on one device.
import { pgTable, uuid, text, integer, numeric, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trackedItemsTable = pgTable(
  "tracked_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    vertical: text("vertical").notNull().default("entertainment"),
    tmdb_id: text("tmdb_id").notNull(),
    media_type: text("media_type").notNull(),
    title: text("title"),
    year: integer("year"),
    genres: text("genres").array(),
    poster_path: text("poster_path"),
    status: text("status"),
    rating: numeric("rating"),
    answers: jsonb("answers"),
    rated_at: timestamp("rated_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    meta: jsonb("meta"),
  },
  (t) => [uniqueIndex("tracked_items_user_item").on(t.user_id, t.tmdb_id, t.media_type)],
);

export const insertTrackedItemSchema = createInsertSchema(trackedItemsTable).omit({ id: true });
export type InsertTrackedItem = z.infer<typeof insertTrackedItemSchema>;
export type TrackedItemRow = typeof trackedItemsTable.$inferSelect;
