-- ============================================================
-- ক, খ, CQ ফাইল-আপলোড ফিচারের জন্য নতুন কলাম
-- এটা Supabase Dashboard > SQL Editor এ গিয়ে রান করতে হবে।
-- বিদ্যমান ka_kha_cq টেবিলের কোনো ডেটা/কলাম মুছে যাবে না —
-- শুধু একটা নতুন optional কলাম যোগ হবে।
-- ============================================================

ALTER TABLE ka_kha_cq
ADD COLUMN IF NOT EXISTS parsed_content JSONB;

-- (ঐচ্ছিক কিন্তু রেকমেন্ডেড) পারফরম্যান্সের জন্য ইনডেক্স —
-- যদি ভবিষ্যতে parsed_content এর ভেতরে সার্চ করার দরকার হয়
-- CREATE INDEX IF NOT EXISTS idx_ka_kha_cq_parsed_content ON ka_kha_cq USING gin (parsed_content);

-- ============================================================
-- স্লাইডশো ফিচারের জন্য নতুন টেবিল
-- হোম পেজে header-এর নিচে auto-slideshow আকারে ছবি দেখানোর জন্য
-- ============================================================

CREATE TABLE IF NOT EXISTS slideshow_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url   TEXT NOT NULL,
    caption     TEXT,
    sort_order  INTEGER DEFAULT 0,
    serial_order INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS enable + পলিসি (অন্য পাবলিক টেবিলের মতোই — সবাই read করতে পারবে,
-- insert/update/delete শুধু authenticated/anon role দিয়ে adminই করবে,
-- যেহেতু এই অ্যাপ ক্লায়েন্ট-সাইড admin check করে)
ALTER TABLE slideshow_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON slideshow_images;
CREATE POLICY "Public read access" ON slideshow_images
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write access" ON slideshow_images;
CREATE POLICY "Public write access" ON slideshow_images
    FOR ALL USING (true) WITH CHECK (true);
