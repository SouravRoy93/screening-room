// ─────────────────────────────────────────────────────────────────────────────
// Cloud sync for dining & places saves (P1-6).
//
// localStorage remains the fast local source of truth (works signed-out and
// offline). When a user is signed in, this module mirrors saves to Supabase
// `tracked_items` so they survive device changes and clears:
//   • pushSave  — upsert/delete one item's flags (+ optional dining journal)
//   • hydrateDining / hydratePlaces — cloud → localStorage on page load
//   • migrate*Local — one-time localStorage → cloud backfill after sign-in
//
// Row mapping: vertical 'dining'|'places', tmdb_id = curated numeric id,
// media_type 'dining'|'place', status = visited→'watched' | booked→'booked'
// | saved→'want', flags & journal in `meta`. Google live results (string ids)
// stay local-only — the bigint id column can't hold them.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

export type SaveFlags = { saved?: boolean; booked?: boolean; visited?: boolean };
export type DiningJournal = { notes?: string; dish?: string; withWho?: string; tags?: string[] };

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

const statusOf = (f: SaveFlags): string | null =>
  f.visited ? "watched" : f.booked ? "booked" : f.saved ? "want" : null;

export async function pushSave(
  vertical: "dining" | "places",
  id: number,
  title: string,
  flags: SaveFlags,
  journal?: DiningJournal,
): Promise<void> {
  const userId = await uid();
  if (!userId || !Number.isFinite(id)) return;
  const mediaType = vertical === "dining" ? "dining" : "place";
  const status = statusOf(flags);
  const hasJournal = !!journal && Object.values(journal).some(v => (Array.isArray(v) ? v.length : v));

  if (!status && !hasJournal) {
    await supabase
      .from("tracked_items")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_id", id)
      .eq("media_type", mediaType);
    return;
  }

  await supabase.from("tracked_items").upsert(
    {
      user_id: userId,
      vertical,
      tmdb_id: String(id),
      media_type: mediaType,
      title,
      status: status ?? "want",
      meta: { ...flags, ...(journal || {}) },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tmdb_id,media_type" },
  );
}

interface CloudRow {
  tmdb_id: number | string;
  meta: (SaveFlags & DiningJournal) | null;
}

async function pullRows(mediaType: "dining" | "place"): Promise<CloudRow[]> {
  const userId = await uid();
  if (!userId) return [];
  const { data } = await supabase
    .from("tracked_items")
    .select("tmdb_id, meta")
    .eq("user_id", userId)
    .eq("media_type", mediaType);
  return (data as CloudRow[]) || [];
}

/** Cloud → localStorage for dining. Returns true if anything was written. */
export async function hydrateDining(): Promise<boolean> {
  const rows = await pullRows("dining");
  let wrote = false;
  for (const row of rows) {
    const id = String(row.tmdb_id);
    const m = row.meta || {};
    for (const flag of ["saved", "booked", "visited"] as const) {
      if (m[flag]) { localStorage.setItem(`sr_dining_${flag}_${id}`, "1"); wrote = true; }
    }
    if (m.notes) localStorage.setItem(`sr_dining_notes_${id}`, m.notes);
    if (m.dish) localStorage.setItem(`sr_dining_dish_${id}`, m.dish);
    if (m.withWho) localStorage.setItem(`sr_dining_with_${id}`, m.withWho);
    if (m.tags?.length) localStorage.setItem(`sr_dining_tags_${id}`, JSON.stringify(m.tags));
  }
  return wrote;
}

/** Cloud → localStorage for places. Returns merged {saved, visited} maps. */
export async function hydratePlaces(): Promise<{ saved: Record<number, boolean>; visited: Record<number, boolean> }> {
  const rows = await pullRows("place");
  const read = (k: string): Record<number, boolean> => {
    try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; }
  };
  const saved = read("pl_saved");
  const visited = read("pl_visited");
  for (const row of rows) {
    const id = Number(row.tmdb_id);
    if (row.meta?.saved) saved[id] = true;
    if (row.meta?.visited) visited[id] = true;
  }
  localStorage.setItem("pl_saved", JSON.stringify(saved));
  localStorage.setItem("pl_visited", JSON.stringify(visited));
  return { saved, visited };
}

/** One-time localStorage → cloud backfill for dining (needs items for titles). */
export async function migrateDiningLocal(items: { id: number; name: string }[]): Promise<void> {
  if (localStorage.getItem("sr_cloud_migrated_dining") === "1") return;
  const userId = await uid();
  if (!userId) return;
  for (const item of items) {
    const flags: SaveFlags = {
      saved: localStorage.getItem(`sr_dining_saved_${item.id}`) === "1",
      booked: localStorage.getItem(`sr_dining_booked_${item.id}`) === "1",
      visited: localStorage.getItem(`sr_dining_visited_${item.id}`) === "1",
    };
    let tags: string[] = [];
    try { tags = JSON.parse(localStorage.getItem(`sr_dining_tags_${item.id}`) || "[]"); } catch { /* noop */ }
    const journal: DiningJournal = {
      notes: localStorage.getItem(`sr_dining_notes_${item.id}`) || undefined,
      dish: localStorage.getItem(`sr_dining_dish_${item.id}`) || undefined,
      withWho: localStorage.getItem(`sr_dining_with_${item.id}`) || undefined,
      tags: tags.length ? tags : undefined,
    };
    if (flags.saved || flags.booked || flags.visited || journal.notes || journal.dish || journal.withWho || journal.tags) {
      await pushSave("dining", item.id, item.name, flags, journal);
    }
  }
  localStorage.setItem("sr_cloud_migrated_dining", "1");
}

/** One-time localStorage → cloud backfill for places. */
export async function migratePlacesLocal(items: { id: number; name: string }[]): Promise<void> {
  if (localStorage.getItem("sr_cloud_migrated_places") === "1") return;
  const userId = await uid();
  if (!userId) return;
  const read = (k: string): Record<number, boolean> => {
    try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; }
  };
  const saved = read("pl_saved");
  const visited = read("pl_visited");
  for (const item of items) {
    if (saved[item.id] || visited[item.id]) {
      await pushSave("places", item.id, item.name, { saved: !!saved[item.id], visited: !!visited[item.id] });
    }
  }
  localStorage.setItem("sr_cloud_migrated_places", "1");
}
