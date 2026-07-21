-- Run this once in Cloudflare Dashboard → Workers & Pages → D1 → MULBOI_DB → Console
-- Adds a permanent cache column so AI explanations are generated once per
-- question and then served instantly (1-2s) to every future viewer.

ALTER TABLE questions ADD COLUMN ai_explanation TEXT;
