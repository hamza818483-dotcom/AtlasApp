-- ============================================================
-- ATLAS APP — Study Tracker Schema (st_subjects / st_chapters / st_topics)
-- Run in Supabase SQL Editor → Dashboard → SQL Editor → New query
-- Project: btezborkuiqfogykrjrn
-- ============================================================

-- ── 1. Subjects (HSC / Medical mode) ──
CREATE TABLE IF NOT EXISTS st_subjects (
    id          bigint generated always as identity primary key,
    name        text NOT NULL,
    short_name  text,
    mode        text NOT NULL CHECK (mode IN ('hsc','medical')),
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- ── 2. Chapters (belong to a subject) ──
CREATE TABLE IF NOT EXISTS st_chapters (
    id          bigint generated always as identity primary key,
    subject_id  bigint NOT NULL REFERENCES st_subjects(id) ON DELETE CASCADE,
    name        text NOT NULL,
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- ── 3. Topics (belong to a chapter, have weight for progress calculation) ──
CREATE TABLE IF NOT EXISTS st_topics (
    id          bigint generated always as identity primary key,
    chapter_id  bigint NOT NULL REFERENCES st_chapters(id) ON DELETE CASCADE,
    name        text NOT NULL,
    weight      int DEFAULT 1,
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- ── 4. User progress view cache ──
CREATE TABLE IF NOT EXISTS st_user_progress (
    id           bigint generated always as identity primary key,
    user_phone   text NOT NULL,
    mode         text NOT NULL CHECK (mode IN ('hsc','medical')),
    done_topics  int DEFAULT 0,
    total_topics int DEFAULT 0,
    pct          numeric(5,2) DEFAULT 0,
    updated_at   timestamptz DEFAULT now(),
    UNIQUE(user_phone, mode)
);

-- ── 5. Per-topic completion tracking per user ──
CREATE TABLE IF NOT EXISTS st_topic_progress (
    id          bigint generated always as identity primary key,
    user_phone  text NOT NULL,
    topic_id    bigint NOT NULL REFERENCES st_topics(id) ON DELETE CASCADE,
    status      text DEFAULT 'pending' CHECK (status IN ('pending','done','revision')),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE(user_phone, topic_id)
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_st_subjects_mode ON st_subjects(mode);
CREATE INDEX IF NOT EXISTS idx_st_chapters_subject ON st_chapters(subject_id);
CREATE INDEX IF NOT EXISTS idx_st_topics_chapter ON st_topics(chapter_id);
CREATE INDEX IF NOT EXISTS idx_st_progress_phone ON st_user_progress(user_phone, mode);
CREATE INDEX IF NOT EXISTS idx_st_topic_progress_phone ON st_topic_progress(user_phone);

-- ── 6. Enable RLS ──
ALTER TABLE st_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_topic_progress ENABLE ROW LEVEL SECURITY;

-- ── 7. RLS Policies (permissive — app-layer admin gating) ──
-- st_subjects
CREATE POLICY "public read"   ON st_subjects FOR SELECT USING (true);
CREATE POLICY "public write"  ON st_subjects FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON st_subjects FOR UPDATE USING (true);
CREATE POLICY "public delete" ON st_subjects FOR DELETE USING (true);

-- st_chapters
CREATE POLICY "public read"   ON st_chapters FOR SELECT USING (true);
CREATE POLICY "public write"  ON st_chapters FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON st_chapters FOR UPDATE USING (true);
CREATE POLICY "public delete" ON st_chapters FOR DELETE USING (true);

-- st_topics
CREATE POLICY "public read"   ON st_topics FOR SELECT USING (true);
CREATE POLICY "public write"  ON st_topics FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON st_topics FOR UPDATE USING (true);
CREATE POLICY "public delete" ON st_topics FOR DELETE USING (true);

-- st_user_progress
CREATE POLICY "public read"   ON st_user_progress FOR SELECT USING (true);
CREATE POLICY "public write"  ON st_user_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON st_user_progress FOR UPDATE USING (true);
CREATE POLICY "public delete" ON st_user_progress FOR DELETE USING (true);

-- st_topic_progress
CREATE POLICY "public read"   ON st_topic_progress FOR SELECT USING (true);
CREATE POLICY "public write"  ON st_topic_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON st_topic_progress FOR UPDATE USING (true);
CREATE POLICY "public delete" ON st_topic_progress FOR DELETE USING (true);

-- ============================================================
-- Done. Tables: st_subjects, st_chapters, st_topics,
--               st_user_progress, st_topic_progress
-- ============================================================
