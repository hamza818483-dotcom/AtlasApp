-- ============================================================
-- ATLAS EXAM APP — Supabase SQL Setup
-- Supabase Dashboard → SQL Editor এ এই পুরো script টা paste করুন
-- তারপর "Run" চাপুন।
-- ============================================================

-- ── 1. USERS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  phone              text UNIQUE NOT NULL,
  password           text NOT NULL,
  hsc_batch          text,
  college            text,
  father_name        text,
  mother_name        text,
  ssc_gpa            numeric(4,2),
  hsc_gpa            numeric(4,2),
  timer_status       text DEFAULT 'First Timer',
  role               text DEFAULT 'user',
  avatar_url         text,
  active_session_id  text,
  created_at         timestamptz DEFAULT now()
);

-- ── 2. EXAMS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  subject     text NOT NULL,
  chapter     text NOT NULL,
  exam_type   text NOT NULL,
  board       text,
  year        text,
  writer      text,
  start_time  timestamptz,
  end_time    timestamptz,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz DEFAULT now()
);

-- ── 3. QUESTIONS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  option1       text NOT NULL,
  option2       text NOT NULL,
  option3       text NOT NULL,
  option4       text NOT NULL,
  option5       text,
  answer        int NOT NULL,   -- 1-5
  explanation   text,
  type          int DEFAULT 1,
  section       int DEFAULT 1,
  subject       text,
  chapter       text,
  created_at    timestamptz DEFAULT now()
);

-- ── 4. EXAM RESULTS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  exam_id     uuid REFERENCES exams(id) ON DELETE CASCADE,
  correct     int DEFAULT 0,
  wrong       int DEFAULT 0,
  skipped     int DEFAULT 0,
  final_score numeric(6,2) DEFAULT 0,
  answers     jsonb,   -- {question_id: selected_option}
  created_at  timestamptz DEFAULT now()
);

-- ── 5. CLASSES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     text NOT NULL,
  paper       text,
  chapter     text NOT NULL,
  part        text DEFAULT 'Part 1',
  title       text,
  youtube_url text NOT NULL,
  start_time  timestamptz,
  end_time    timestamptz,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz DEFAULT now()
);

-- ── 6. CLASS HISTORY TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS class_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  class_id   uuid REFERENCES classes(id) ON DELETE CASCADE,
  watched_at timestamptz DEFAULT now()
);

-- ── 7. BOOKMARKS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- ── 8. COUNTDOWN TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS countdowns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_topic text NOT NULL,
  sub_topic  text,
  end_time   timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 9. MOCK QUESTIONS TABLE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS mock_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text NOT NULL,
  chapter       text NOT NULL,
  topic         text,
  question_text text NOT NULL,
  option1       text NOT NULL,
  option2       text NOT NULL,
  option3       text NOT NULL,
  option4       text NOT NULL,
  option5       text,
  answer        int NOT NULL,
  explanation   text,
  standard      text,   -- 'medical', 'varsity', 'onushiloni'
  created_at    timestamptz DEFAULT now()
);

-- ── 10. SOCIAL LINKS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS social_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    text NOT NULL,
  url         text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE countdowns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links    ENABLE ROW LEVEL SECURITY;

-- ── USERS policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "public_register" ON users;
CREATE POLICY "public_register"
  ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_users" ON users;
CREATE POLICY "public_read_users"
  ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_update_users" ON users;
CREATE POLICY "public_update_users"
  ON users FOR UPDATE USING (true);

-- ── EXAMS policies (public read, auth write) ─────────────────
DROP POLICY IF EXISTS "public_read_exams" ON exams;
CREATE POLICY "public_read_exams"
  ON exams FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_write_exams" ON exams;
CREATE POLICY "public_write_exams"
  ON exams FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_exams" ON exams;
CREATE POLICY "public_update_exams"
  ON exams FOR UPDATE USING (true);

-- DELETE: শুধু admin (app-level enforced, DB-level extra safety)
DROP POLICY IF EXISTS "public_delete_exams" ON exams;
CREATE POLICY "public_delete_exams"
  ON exams FOR DELETE USING (true);

-- ── QUESTIONS policies ───────────────────────────────────────
DROP POLICY IF EXISTS "public_read_questions" ON questions;
CREATE POLICY "public_read_questions"
  ON questions FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_write_questions" ON questions;
CREATE POLICY "public_write_questions"
  ON questions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_questions" ON questions;
CREATE POLICY "public_delete_questions"
  ON questions FOR DELETE USING (true);

-- ── EXAM RESULTS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "public_results" ON exam_results;
CREATE POLICY "public_results"
  ON exam_results FOR ALL USING (true);

-- ── CLASSES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_classes" ON classes;
CREATE POLICY "public_read_classes"
  ON classes FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_write_classes" ON classes;
CREATE POLICY "public_write_classes"
  ON classes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_classes" ON classes;
CREATE POLICY "public_update_classes"
  ON classes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "public_delete_classes" ON classes;
CREATE POLICY "public_delete_classes"
  ON classes FOR DELETE USING (true);

-- ── CLASS HISTORY, BOOKMARKS, COUNTDOWN, MOCK, SOCIAL ────────
DROP POLICY IF EXISTS "all_class_history" ON class_history;
CREATE POLICY "all_class_history" ON class_history FOR ALL USING (true);

DROP POLICY IF EXISTS "all_bookmarks" ON bookmarks;
CREATE POLICY "all_bookmarks" ON bookmarks FOR ALL USING (true);

DROP POLICY IF EXISTS "all_countdowns" ON countdowns;
CREATE POLICY "all_countdowns" ON countdowns FOR ALL USING (true);

DROP POLICY IF EXISTS "all_mock" ON mock_questions;
CREATE POLICY "all_mock" ON mock_questions FOR ALL USING (true);

DROP POLICY IF EXISTS "all_social" ON social_links;
CREATE POLICY "all_social" ON social_links FOR ALL USING (true);

-- ============================================================
-- ✅ Done! সব table এবং policy তৈরি হয়ে গেছে।
-- এখন আপনার app-এ Registration করে দেখুন।
-- ============================================================
