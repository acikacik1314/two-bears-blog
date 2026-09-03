-- ── Post Interactions: views + likes ────────────────────────────────────────
-- 目的: Vercel Blob（計數器用途に不適）から Supabase に移行
-- 実行: Supabase Dashboard → SQL Editor → 貼り付けて Run
--
-- 操作ごとに JSON 全体を read-modify-write していた blob と異なり、
-- UPDATE ... SET count = count + 1 の単一 SQL になるため、
-- 1操作 = 1 DB call、競合状態なし。

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_views (
  slug        TEXT        PRIMARY KEY,
  count       INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_likes (
  slug        TEXT        PRIMARY KEY,
  count       INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RPC: Atomic increment ────────────────────────────────────────────────────
-- UPSERT + RETURNING count を一発で実行。競合状態なし。

CREATE OR REPLACE FUNCTION increment_view(p_slug TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO post_views (slug, count, updated_at)
  VALUES (p_slug, 1, now())
  ON CONFLICT (slug)
  DO UPDATE SET count = post_views.count + 1, updated_at = now()
  RETURNING count;
$$;

CREATE OR REPLACE FUNCTION increment_like(p_slug TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO post_likes (slug, count, updated_at)
  VALUES (p_slug, 1, now())
  ON CONFLICT (slug)
  DO UPDATE SET count = post_likes.count + 1, updated_at = now()
  RETURNING count;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- API ルートは service_role key 経由なので RLS は bypass される。
-- 念のため anon による直接アクセスを制限。

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- 読み取りは anon も OK（フロントのスコアリングで使用）
CREATE POLICY "views_read_all" ON post_views FOR SELECT USING (true);
CREATE POLICY "likes_read_all" ON post_likes FOR SELECT USING (true);

-- 書き込みは service_role のみ（API ルート経由）
-- service_role は RLS を bypass するため INSERT/UPDATE ポリシーは不要。

-- ── 動作確認クエリ（実行後に試す）──────────────────────────────────────────
-- SELECT increment_view('/blog/test-post/');
-- SELECT increment_view('/blog/test-post/');
-- SELECT * FROM post_views WHERE slug = '/blog/test-post/';
-- → count が 2 になっていれば成功
