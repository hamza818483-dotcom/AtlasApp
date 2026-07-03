-- Quick Practice Leaderboard: persist snapshot of every user's rank/points
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS qp_leaderboard_snapshot (
    id BIGSERIAL PRIMARY KEY,
    user_phone TEXT NOT NULL,
    name TEXT,
    batch TEXT,
    photo_url TEXT,
    total_points INT NOT NULL DEFAULT 0,
    total_correct INT NOT NULL DEFAULT 0,
    total_quizzes INT NOT NULL DEFAULT 0,
    rank INT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qp_leaderboard_snapshot_phone ON qp_leaderboard_snapshot(user_phone);
CREATE INDEX IF NOT EXISTS idx_qp_leaderboard_snapshot_rank ON qp_leaderboard_snapshot(rank);

-- Clear old snapshot and insert fresh ranked data for ALL users currently in qp_user_points
TRUNCATE qp_leaderboard_snapshot;

INSERT INTO qp_leaderboard_snapshot (user_phone, name, batch, photo_url, total_points, total_correct, total_quizzes, rank)
SELECT
    p.user_phone,
    u.name,
    u.batch,
    u.photo_url,
    p.total_points,
    p.total_correct,
    p.total_quizzes,
    RANK() OVER (ORDER BY p.total_points DESC) AS rank
FROM qp_user_points p
LEFT JOIN users u ON u.phone = p.user_phone
ORDER BY p.total_points DESC;
