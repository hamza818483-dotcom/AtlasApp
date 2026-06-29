-- ============================================================
-- ATLAS APP — PDF OCR Text Layer Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Per-page OCR text storage
CREATE TABLE IF NOT EXISTS book_pdf_pages (
    id              bigint generated always as identity primary key,
    pdf_id          bigint NOT NULL REFERENCES book_pdfs(id) ON DELETE CASCADE,
    page_number     int NOT NULL,
    extracted_text  text,                           -- OCR extracted text
    ocr_status      text DEFAULT 'pending',         -- 'pending' | 'processing' | 'done' | 'failed' | 'empty'
    ocr_attempts    int DEFAULT 0,
    word_count      int DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE(pdf_id, page_number)
);

-- OCR job queue (tracks overall PDF OCR progress)
CREATE TABLE IF NOT EXISTS book_pdf_ocr_jobs (
    id              bigint generated always as identity primary key,
    pdf_id          bigint NOT NULL REFERENCES book_pdfs(id) ON DELETE CASCADE UNIQUE,
    total_pages     int DEFAULT 0,
    done_pages      int DEFAULT 0,
    status          text DEFAULT 'queued',          -- 'queued' | 'processing' | 'done' | 'failed'
    started_at      timestamptz,
    finished_at     timestamptz,
    created_at      timestamptz DEFAULT now()
);

-- Index for fast page lookup
CREATE INDEX IF NOT EXISTS idx_book_pdf_pages_pdf_id ON book_pdf_pages(pdf_id);
CREATE INDEX IF NOT EXISTS idx_book_pdf_pages_status ON book_pdf_pages(ocr_status);

-- Add page_count column update trigger
CREATE OR REPLACE FUNCTION update_pdf_page_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE book_pdfs
    SET page_count = (
        SELECT COUNT(*) FROM book_pdf_pages
        WHERE pdf_id = NEW.pdf_id AND ocr_status = 'done'
    )
    WHERE id = NEW.pdf_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_pdf_page_count ON book_pdf_pages;
CREATE TRIGGER trg_update_pdf_page_count
    AFTER INSERT OR UPDATE ON book_pdf_pages
    FOR EACH ROW EXECUTE FUNCTION update_pdf_page_count();

