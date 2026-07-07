-- ============================================================
-- Permanent Disk-IO reduction for Free plan (no compute upgrade needed).
-- Run once in Supabase SQL Editor. Project: btezborkuiqfogykrjrn
--
-- Why: duplicate rows (before the unique-constraint fix) + large
-- questions_json blobs caused table bloat. Bloated tables force Postgres
-- to read far more disk pages per query than the live data needs, which
-- is the main driver of Disk IO budget depletion on Free/Micro compute.
-- VACUUM reclaims that dead space; tightening autovacuum keeps it reclaimed
-- automatically going forward instead of bloat re-accumulating.
-- ============================================================

-- Reclaim space from now-deleted duplicate rows and update planner stats.
VACUUM (VERBOSE, ANALYZE) book_page_mcqs;

-- Make autovacuum run more eagerly on this table specifically (it changes
-- often via admin edits/AI generation), so dead tuples don't build back up
-- into another Disk-IO problem later.
ALTER TABLE book_page_mcqs SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

-- Sanity check: dead tuple % should now be near 0.
-- SELECT relname, n_live_tup, n_dead_tup,
--        round(n_dead_tup::numeric / GREATEST(n_live_tup,1) * 100, 1) AS dead_pct
-- FROM pg_stat_user_tables WHERE relname = 'book_page_mcqs';
