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

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference UUID NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount = 50000),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  email TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS tac_models (
  tac CHAR(8) PRIMARY KEY,
  brand TEXT,
  model TEXT,
  source TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_status_created_at_idx
  ON payments (status, created_at);

CREATE TABLE IF NOT EXISTS payment_rate_limits (
  scope TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (scope, client_hash)
);

CREATE INDEX IF NOT EXISTS payment_rate_limits_window_started_at_idx
  ON payment_rate_limits (window_started_at);
