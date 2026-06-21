-- ============================================================
-- ATLAS APP — New Feature Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Project: btezborkuiqfogykrjrn
-- ============================================================

-- ── 1. Premium/Free package flag on existing users table ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expiry timestamptz;

-- ── 2. মূলবই পেইজভিত্তিক প্রস্তুতি: Subject → Chapter → PDF hierarchy ──
CREATE TABLE IF NOT EXISTS book_subjects (
    id          bigint generated always as identity primary key,
    name        text NOT NULL,
    description text,
    icon        text,            -- emoji/sticker shown on subject card
    color_idx   int DEFAULT 0,   -- which gradient theme (g0-g7) to use
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_chapters (
    id          bigint generated always as identity primary key,
    subject_id  bigint NOT NULL REFERENCES book_subjects(id) ON DELETE CASCADE,
    name        text NOT NULL,
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_pdfs (
    id          bigint generated always as identity primary key,
    chapter_id  bigint NOT NULL REFERENCES book_chapters(id) ON DELETE CASCADE,
    title       text NOT NULL,
    file_url    text NOT NULL,   -- public URL from Supabase Storage 'pdfs' bucket
    page_count  int,
    is_premium  boolean DEFAULT false,  -- per-PDF premium lock (admin toggle)
    sort_order  int DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- Track free-tier page views so the existing "remaining_pages" free-quota
-- pattern (already used elsewhere in the app) extends naturally to this feature.
CREATE TABLE IF NOT EXISTS book_page_views (
    id          bigint generated always as identity primary key,
    user_phone  text NOT NULL,
    pdf_id      bigint NOT NULL REFERENCES book_pdfs(id) ON DELETE CASCADE,
    page_number int NOT NULL,
    viewed_at   timestamptz DEFAULT now(),
    UNIQUE(user_phone, pdf_id, page_number)
);

-- Cache AI-generated MCQs per page so re-opening the same page/type doesn't
-- re-call Gemini/Groq every time (saves API quota + cost).
CREATE TABLE IF NOT EXISTS book_page_mcqs (
    id           bigint generated always as identity primary key,
    pdf_id       bigint NOT NULL REFERENCES book_pdfs(id) ON DELETE CASCADE,
    page_number  int NOT NULL,
    mcq_type     text NOT NULL,   -- 'standard' | 'true_false' | 'hard'
    questions_json text NOT NULL, -- array of {question,options,answer,explanation}
    created_at   timestamptz DEFAULT now(),
    UNIQUE(pdf_id, page_number, mcq_type)
);

-- ── 3. Focus Timer: live "who's studying now" sessions ──
-- Ensure users.phone is unique (required for the FK below + already the
-- de-facto primary lookup key used everywhere else in the app via
-- auth.html's getByPhone()). Safe no-op if already unique.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS focus_sessions (
    id            bigint generated always as identity primary key,
    user_phone    text NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'active',  -- 'active' | 'break' | 'ended'
    study_seconds int DEFAULT 0,
    break_seconds int DEFAULT 0,
    breaks_used   int DEFAULT 0,
    started_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now(),
    ended_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_status ON focus_sessions(status, user_phone);

-- Daily aggregate for "Study Tracker" (placeholder table — fields can be
-- extended later when Study Tracker's exact scope is finalized).
CREATE TABLE IF NOT EXISTS study_tracker_daily (
    id            bigint generated always as identity primary key,
    user_phone    text NOT NULL,
    study_date    date NOT NULL DEFAULT current_date,
    total_seconds int DEFAULT 0,
    UNIQUE(user_phone, study_date)
);

-- ============================================================
-- Row Level Security: keep these tables readable by the anon key
-- (same pattern AtlasApp already uses for all other tables — auth is
-- handled at the application layer via localStorage 'atlas-session',
-- not Supabase Auth, so RLS is left permissive to match existing tables).
-- ============================================================
ALTER TABLE book_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_page_mcqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_tracker_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON book_subjects FOR SELECT USING (true);
CREATE POLICY "public read" ON book_chapters FOR SELECT USING (true);
-- KNOWN LIMITATION: app-layer premium gating (study.html checks
-- currentUser.is_premium before requesting file_url) is the only real
-- enforcement here. Because this app authenticates via localStorage
-- ('atlas-session'), not Supabase Auth, RLS cannot see who's logged in or
-- whether they're premium — so this policy is permissive for everyone,
-- and a technically determined user could query book_pdfs?select=file_url
-- directly and bypass the UI gate. True server-side enforcement would
-- require either Supabase Auth + a premium-aware RLS policy, or a small
-- backend endpoint that checks premium status before returning the URL —
-- worth doing if premium content needs to be airtight rather than just
-- UI-gated for casual users.
CREATE POLICY "public read" ON book_pdfs FOR SELECT USING (true);
CREATE POLICY "public read" ON book_page_views FOR SELECT USING (true);
CREATE POLICY "public write" ON book_page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "public read" ON book_page_mcqs FOR SELECT USING (true);
CREATE POLICY "public write" ON book_page_mcqs FOR INSERT WITH CHECK (true);
CREATE POLICY "public read" ON focus_sessions FOR SELECT USING (true);
CREATE POLICY "public write" ON focus_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON focus_sessions FOR UPDATE USING (true);
CREATE POLICY "public read" ON study_tracker_daily FOR SELECT USING (true);
CREATE POLICY "public write" ON study_tracker_daily FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON study_tracker_daily FOR UPDATE USING (true);

-- Admin-only write for subjects/chapters/pdfs is enforced at the app layer
-- (admin.html checks currentUser.role === 'admin' before showing the
-- management UI), matching how every other admin-managed table in this
-- app already works — no separate Supabase Auth role system exists yet.
CREATE POLICY "public write" ON book_subjects FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON book_subjects FOR UPDATE USING (true);
CREATE POLICY "public delete" ON book_subjects FOR DELETE USING (true);
CREATE POLICY "public write" ON book_chapters FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON book_chapters FOR UPDATE USING (true);
CREATE POLICY "public delete" ON book_chapters FOR DELETE USING (true);
CREATE POLICY "public write" ON book_pdfs FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON book_pdfs FOR UPDATE USING (true);
CREATE POLICY "public delete" ON book_pdfs FOR DELETE USING (true);
