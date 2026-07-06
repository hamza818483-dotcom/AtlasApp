-- ============================================================
-- FIX: "canceling statement due to statement timeout" (code 57014)
-- on book_page_mcqs queries used by মূলবই PDF-Edit page pills.
--
-- Root cause: book_page_mcqs has NO index on pdf_id. The admin panel's
-- mbLoadAllPageMcqs() runs `pdf_id=eq.<id>` filters (both admin-only and
-- all-types), and as this table grows (many PDFs × pages × mcq_types,
-- each row possibly containing large questions_json blobs with embedded
-- base64 explanation images), a pdf_id filter with no index forces a full
-- table scan — which eventually exceeds Supabase's statement_timeout and
-- the whole page-pill "instant MCQ count" feature fails to load.
--
-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Project: btezborkuiqfogykrjrn
-- ============================================================

-- Composite index matches exactly the two query shapes used by the admin panel:
--   1) pdf_id=eq.X & mcq_type=eq.admin   (admin-only editable rows)
--   2) pdf_id=eq.X                        (all types, for pill counts)
-- Postgres can use a composite (pdf_id, mcq_type) index for both, since the
-- leading column alone satisfies query (2).
CREATE INDEX IF NOT EXISTS idx_book_page_mcqs_pdf_type
    ON book_page_mcqs (pdf_id, mcq_type);

-- Secondary index to speed up page_number ordering/lookups (used when
-- rendering a specific page's MCQ list, and by ORDER BY page_number below).
CREATE INDEX IF NOT EXISTS idx_book_page_mcqs_pdf_page
    ON book_page_mcqs (pdf_id, page_number);

-- Sanity check: confirm both indexes now exist.
-- SELECT indexname FROM pg_indexes WHERE tablename = 'book_page_mcqs';
