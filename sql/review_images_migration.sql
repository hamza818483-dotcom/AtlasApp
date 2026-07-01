-- Review Section: Class/Exam/Mentoring/Other ক্যাটাগরি অনুযায়ী গ্যালারি-স্টাইল ছবি
CREATE TABLE IF NOT EXISTS review_images (
    id          bigint generated always as identity primary key,
    category    text NOT NULL,              -- 'class' | 'exam' | 'mentoring' | 'other'
    image_url   text NOT NULL,
    caption     text,
    sort_order  int DEFAULT 0,
    is_active   boolean DEFAULT true,
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON review_images;
CREATE POLICY "public read" ON review_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON review_images;
CREATE POLICY "public write" ON review_images FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public update" ON review_images;
CREATE POLICY "public update" ON review_images FOR UPDATE USING (true);

DROP POLICY IF EXISTS "public delete" ON review_images;
CREATE POLICY "public delete" ON review_images FOR DELETE USING (true);
