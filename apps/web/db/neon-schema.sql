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
