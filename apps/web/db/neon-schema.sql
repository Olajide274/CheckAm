CREATE TABLE IF NOT EXISTS waitlist_signups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  preferred_feature TEXT NOT NULL CHECK (
    preferred_feature IN (
      'Model match',
      'Registry status',
      'Seller proof',
      'Bill of sale',
      'WhatsApp check',
      'Condition snapshot'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'page_view',
      'imei_check_attempted',
      'full_report_click',
      'waitlist_signup',
      'feature_preference'
    )
  ),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist_signups
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_feature TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'pro')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE user_accounts
SET full_name = COALESCE(
  NULLIF(BTRIM(full_name), ''),
  NULLIF(SPLIT_PART(email, '@', 1), ''),
  email
)
WHERE full_name IS NULL OR BTRIM(full_name) = '';

ALTER TABLE user_accounts
  ALTER COLUMN full_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_username_unique_idx
  ON user_accounts (LOWER(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_email_verification_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_rate_limits (
  scope TEXT NOT NULL,
  identifier_hash CHAR(64) NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (scope, identifier_hash)
);

CREATE TABLE IF NOT EXISTS account_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('bill_of_sale')),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_usage_account_action_used_idx
  ON account_usage (account_id, action, used_at);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference UUID NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount = 50000),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  email TEXT NOT NULL,
  account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  imei_hash TEXT,
  tac CHAR(8),
  imei_last4 CHAR(4),
  imei_format_valid BOOLEAN,
  imei_luhn_valid BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  CHECK ((status = 'success') = (paid_at IS NOT NULL)),
  CHECK ((imei_hash IS NULL) = (imei_last4 IS NULL)),
  CHECK ((imei_hash IS NULL) = (imei_format_valid IS NULL)),
  CHECK ((imei_hash IS NULL) = (imei_luhn_valid IS NULL))
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tac CHAR(8),
  ADD COLUMN IF NOT EXISTS imei_format_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS imei_luhn_valid BOOLEAN;

CREATE TABLE IF NOT EXISTS tac_models (
  tac CHAR(8) PRIMARY KEY,
  brand TEXT,
  model TEXT,
  source TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tac_models
  ADD COLUMN IF NOT EXISTS tac CHAR(8),
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS payments_status_created_at_idx
  ON payments (status, created_at);

CREATE TABLE IF NOT EXISTS payment_rate_limits (
  scope TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (scope, client_hash)
);

ALTER TABLE payment_rate_limits
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS client_hash TEXT,
  ADD COLUMN IF NOT EXISTS window_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_count INTEGER;

CREATE INDEX IF NOT EXISTS payment_rate_limits_window_started_at_idx
  ON payment_rate_limits (window_started_at);

CREATE TABLE IF NOT EXISTS seller_proof_requests (
  id UUID PRIMARY KEY,
  payment_reference UUID NOT NULL REFERENCES payments(reference) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  proof_mime TEXT CHECK (proof_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  proof_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK ((proof_data IS NULL) = (proof_mime IS NULL))
);

ALTER TABLE seller_proof_requests
  ADD COLUMN IF NOT EXISTS id UUID,
  ADD COLUMN IF NOT EXISTS payment_reference UUID,
  ADD COLUMN IF NOT EXISTS token_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS proof_mime TEXT,
  ADD COLUMN IF NOT EXISTS proof_data BYTEA,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

ALTER TABLE seller_proof_requests
  DROP COLUMN IF EXISTS seller_phone;

CREATE INDEX IF NOT EXISTS seller_proof_requests_payment_created_idx
  ON seller_proof_requests (payment_reference, created_at DESC);
