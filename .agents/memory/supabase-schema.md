---
name: Supabase tracked_items schema
description: Existing tracked_items table columns and upsert conflict key
---

## Table: tracked_items
Columns: user_id, vertical (films/dining/places), tmdb_id (text), media_type (movie/tv), title, year, genres (text[]), poster_path, status (want/watching/watched), rating (int), rated_at (timestamptz), updated_at (timestamptz)

## Upsert conflict key
`onConflict: "user_id,tmdb_id,media_type"` — unique per user per item

## Supabase URL
https://jxqtggajabevmpzpxhtk.supabase.co (stored in VITE_SUPABASE_URL env var, do not hardcode)

**Why:** Schema was pre-existing from the original single-file HTML app; keeping same column names ensures backward compatibility.
