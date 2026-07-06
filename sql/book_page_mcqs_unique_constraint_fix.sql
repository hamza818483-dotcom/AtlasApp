-- ============================================================
-- FIX: page pill MCQ count wrong/missing on PDF-edit page.
--
-- Root cause: mulboi-mcq-admin.js's upsert calls use
--   POST /book_page_mcqs?on_conflict=pdf_id,page_number,mcq_type
-- with header Prefer: resolution=merge-duplicates.
-- PostgREST's on_conflict merge-duplicates ONLY works if a matching
-- UNIQUE or PRIMARY KEY constraint exists on those exact columns.
-- book_page_mcqs never had this constraint, so every "upsert" was
-- silently just an INSERT — creating duplicate rows per
-- (pdf_id, page_number, mcq_type) each time a page was regenerated/edited.
-- Duplicate rows caused:
--   1) Page pill counts to be wrong (summed duplicate questions_json, or
--      picked an arbitrary/stale duplicate row when only one was expected)
--   2) Slower queries as book_page_mcqs grew from unbounded duplicates
--
-- Run this once in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- Project: btezborkuiqfogykrjrn
-- ============================================================

-- Step 1: remove existing duplicate rows, keeping only the most recent
-- row per (pdf_id, page_number, mcq_type).
DELETE FROM book_page_mcqs a
USING book_page_mcqs b
WHERE a.pdf_id = b.pdf_id
  AND a.page_number = b.page_number
  AND a.mcq_type = b.mcq_type
  AND a.id < b.id;

-- Step 2: add the unique constraint so on_conflict merge-duplicates
-- actually works going forward (no more duplicate accumulation).
ALTER TABLE book_page_mcqs
    ADD CONSTRAINT book_page_mcqs_pdf_page_type_unique
    UNIQUE (pdf_id, page_number, mcq_type);

-- Sanity check: should show zero duplicate groups.
-- SELECT pdf_id, page_number, mcq_type, COUNT(*)
-- FROM book_page_mcqs GROUP BY 1,2,3 HAVING COUNT(*) > 1;
