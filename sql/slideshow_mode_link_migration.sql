-- Slideshow: Exact/Compact mode + per-image clickable link
ALTER TABLE slideshow_images ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE slideshow_images ADD COLUMN IF NOT EXISTS display_mode text DEFAULT 'exact'; -- 'exact' | 'compact'
