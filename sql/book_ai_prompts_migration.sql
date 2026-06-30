-- ============================================================
-- ATLAS APP — মূলবই AI Prompt Save/Load (per-PDF, per-type)
-- Parity feature with AtlasPro's admin/pdf.html "প্রম্পট সেভ করো" /
-- "সেভ করা প্রম্পট" buttons in the AI-generate tab.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Project: btezborkuiqfogykrjrn
-- ============================================================

CREATE TABLE IF NOT EXISTS book_ai_prompts (
    id          bigint generated always as identity primary key,
    pdf_id      bigint NOT NULL REFERENCES book_pdfs(id) ON DELETE CASCADE,
    mcq_type    text NOT NULL,
    prompt      text NOT NULL,
    updated_at  timestamptz DEFAULT now(),
    UNIQUE(pdf_id, mcq_type)
);

ALTER TABLE book_ai_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON book_ai_prompts;
CREATE POLICY "public read" ON book_ai_prompts FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON book_ai_prompts;
CREATE POLICY "public write" ON book_ai_prompts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public update" ON book_ai_prompts;
CREATE POLICY "public update" ON book_ai_prompts FOR UPDATE USING (true);

-- pdf_id=0 কে "global prompt" (সব PDF এর জন্য প্রযোজ্য) হিসেবে ব্যবহারের জন্য FK constraint শিথিল করা
ALTER TABLE book_ai_prompts DROP CONSTRAINT IF EXISTS book_ai_prompts_pdf_id_fkey;
