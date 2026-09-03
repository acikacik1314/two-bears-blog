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
--
-- SECURITY DEFINER: 関数はオーナー（postgres）権限で実行される。
--   これにより anon は TABLE に直接書けないが、関数経由では書ける。
--   だからこそ後段で REVOKE EXECUTE FROM PUBLIC が必要。
--
-- SET search_path = public: SECURITY DEFINER 関数の推奨設定。
--   search_path インジェクション攻撃を防ぐ。

CREATE OR REPLACE FUNCTION increment_view(p_slug TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
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
SET search_path = public
AS $$
  INSERT INTO post_likes (slug, count, updated_at)
  VALUES (p_slug, 1, now())
  ON CONFLICT (slug)
  DO UPDATE SET count = post_likes.count + 1, updated_at = now()
  RETURNING count;
$$;

-- ── 権限: EXECUTE を PUBLIC から剥奪 ─────────────────────────────────────────
-- PostgreSQL は CREATE FUNCTION 時にデフォルトで PUBLIC に EXECUTE を付与する。
-- これを放置すると anon key を持つ人が Supabase REST API 経由で
-- 直接 increment_view を呼べてしまう（我々の API を迂回して書き放題）。
-- REVOKE で anon・authenticated・Public すべてから剥奪し、
-- service_role のみが実行できる状態にする。
-- （service_role は RLS/権限を bypass するため別途 GRANT 不要）

REVOKE EXECUTE ON FUNCTION increment_view(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_like(TEXT) FROM PUBLIC;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- API ルートは service_role key → RLS を bypass して書き込み。
-- anon は読み取りのみ（index.astro のスコアリングで使用）。
-- anon には INSERT / UPDATE / DELETE ポリシーを付けない。

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "views_read_anon"  ON post_views FOR SELECT USING (true);
CREATE POLICY "likes_read_anon"  ON post_likes FOR SELECT USING (true);

-- ── 攻撃面のまとめ ──────────────────────────────────────────────────────────
-- anon が Supabase に直接触れる操作:
--   SELECT post_views / post_likes    → OK (読み取りのみ)
--   rpc/increment_view や rpc/increment_like → 403 (REVOKE済)
--   INSERT/UPDATE/DELETE tables       → 403 (RLS ポリシーなし)
--
-- 書き込みができるのは service_role key を持つサーバーサイド API のみ。

-- ── 動作確認クエリ（SQL Editor で Run してから試す）────────────────────────
-- SELECT increment_view('/blog/test-post/');
-- SELECT increment_view('/blog/test-post/');
-- SELECT * FROM post_views WHERE slug = '/blog/test-post/';
-- → count が 2 になっていれば成功
--
-- anon 権限テスト（Dashboard の anon key で試す、または curl で）:
-- POST https://[project-ref].supabase.co/rest/v1/rpc/increment_view
-- Authorization: Bearer [anon-key]
-- Content-Type: application/json
-- Body: {"p_slug":"/test/"}
-- → 403 または "permission denied" が正しい応答
