-- AI দিয়ে generate হওয়া MCQ গুলোর CSV ফাইল সংরক্ষণের জন্য টেবিল
CREATE TABLE IF NOT EXISTS book_mcq_csv_archive (
    id          bigint generated always as identity primary key,
    pdf_id      bigint NOT NULL,
    page_number int,            -- নির্দিষ্ট পেইজের CSV হলে page no, "All pages" বা সম্মিলিত হলে NULL
    file_name   text NOT NULL,
    csv_content text NOT NULL,
    question_count int DEFAULT 0,
    mcq_type    text,
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE book_mcq_csv_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON book_mcq_csv_archive;
CREATE POLICY "public read" ON book_mcq_csv_archive FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON book_mcq_csv_archive;
CREATE POLICY "public write" ON book_mcq_csv_archive FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public delete" ON book_mcq_csv_archive;
CREATE POLICY "public delete" ON book_mcq_csv_archive FOR DELETE USING (true);
