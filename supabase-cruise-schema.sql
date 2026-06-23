-- ============================================================
-- 熊愛郵輪 · 郵輪特賣資料庫
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ============================================================

-- 郵輪特賣主表
CREATE TABLE cruise_deals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 船隻 & 航線
  ship_name       TEXT        NOT NULL,
  cruise_line     TEXT        NOT NULL,
  destination     TEXT        NOT NULL,
  departure_port  TEXT        NOT NULL,
  departure_date  DATE        NOT NULL,
  duration_nights INTEGER     NOT NULL,
  cabin_type      TEXT        NOT NULL DEFAULT '內艙',

  -- 定價
  original_price  INTEGER,
  current_price   INTEGER     NOT NULL,
  price_currency  TEXT        DEFAULT 'TWD',

  -- 聯盟
  affiliate_url   TEXT        NOT NULL,
  source          TEXT,

  -- 標籤
  is_last_minute    BOOLEAN   DEFAULT FALSE,
  is_repositioning  BOOLEAN   DEFAULT FALSE,
  has_kids_free     BOOLEAN   DEFAULT FALSE,
  has_3rd_free      BOOLEAN   DEFAULT FALSE,
  has_obc           BOOLEAN   DEFAULT FALSE,

  -- 岸上觀光 (Klook / KKday)
  shore_excursion_url  TEXT,
  shore_excursion_note TEXT,

  -- 其他
  notes        TEXT,
  status       TEXT    DEFAULT 'active',
  is_featured  BOOLEAN DEFAULT FALSE
);

-- 價格歷史表（每次更新現價自動新增一筆）
CREATE TABLE cruise_price_history (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id    UUID        REFERENCES cruise_deals(id) ON DELETE CASCADE,
  price      INTEGER     NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security（公開讀取，寫入靠 service role key）
ALTER TABLE cruise_deals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_price_history  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cruise_deals_public_read"
  ON cruise_deals FOR SELECT USING (true);

CREATE POLICY "cruise_price_history_public_read"
  ON cruise_price_history FOR SELECT USING (true);

-- Index 加速篩選
CREATE INDEX idx_cruise_deals_status          ON cruise_deals(status);
CREATE INDEX idx_cruise_deals_departure_port  ON cruise_deals(departure_port);
CREATE INDEX idx_cruise_deals_cruise_line     ON cruise_deals(cruise_line);
CREATE INDEX idx_cruise_deals_departure_date  ON cruise_deals(departure_date);
CREATE INDEX idx_cruise_price_history_deal_id ON cruise_price_history(deal_id);
