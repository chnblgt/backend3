CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL    PRIMARY KEY,
    email               TEXT         UNIQUE NOT NULL,
    username            TEXT         UNIQUE NOT NULL,
    password            TEXT,
    name                TEXT,
    bio                 TEXT,
    location            TEXT,
    phone               TEXT,
    avatar              TEXT,
    provider            TEXT         DEFAULT 'local',
    email_verified      SMALLINT     DEFAULT 0,
    verification_token  TEXT,
    is_admin            SMALLINT     DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clubs (
    id                  BIGSERIAL    PRIMARY KEY,
    name                TEXT         NOT NULL,
    category            TEXT         NOT NULL,
    description         TEXT         NOT NULL,
    email               TEXT         NOT NULL,
    phone               TEXT,
    website             TEXT,
    address             TEXT,
    district            TEXT,
    pricing_type        TEXT         DEFAULT 'free',
    founded_year        INT,
    logo                TEXT,
    banner              TEXT,
    tiers               TEXT,
    email_verified      SMALLINT     DEFAULT 0,
    verification_token  TEXT,
    approved            SMALLINT     DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
    id        BIGSERIAL    PRIMARY KEY,
    user_id   BIGINT       NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    club_id   BIGINT       NOT NULL REFERENCES clubs(id)  ON DELETE CASCADE,
    joined_at TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_clubs_approved   ON clubs(approved);
CREATE INDEX IF NOT EXISTS idx_clubs_category   ON clubs(category);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club ON memberships(club_id);

ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_clubs" ON clubs;
CREATE POLICY "public_read_approved_clubs"
    ON clubs FOR SELECT
    TO anon, authenticated
    USING (approved = 1);

DROP POLICY IF EXISTS "user_own_memberships" ON memberships;
CREATE POLICY "user_own_memberships"
    ON memberships FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "service_all_clubs" ON clubs;
CREATE POLICY "service_all_clubs"
    ON clubs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_users" ON users;
CREATE POLICY "service_all_users"
    ON users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_memberships" ON memberships;
CREATE POLICY "service_all_memberships"
    ON memberships FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

UPDATE users SET is_admin = 1 WHERE email = 'duguilanmail@gmail.com';
UPDATE clubs SET approved = 1 WHERE approved = 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS lat FLOAT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS lng FLOAT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS tier_name       TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payment_status  TEXT DEFAULT 'free';

CREATE TABLE IF NOT EXISTS payments (
  id          BIGSERIAL    PRIMARY KEY,
  club_id     BIGINT       REFERENCES clubs(id) ON DELETE CASCADE,
  user_id     BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC,
  tier_name   TEXT,
  status      TEXT         DEFAULT 'pending',
  receipt_url TEXT,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_club ON payments(club_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_payments" ON payments;
CREATE POLICY "service_all_payments"
    ON payments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS qpay_info TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS dans_info TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_note TEXT;
