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