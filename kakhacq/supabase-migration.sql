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
