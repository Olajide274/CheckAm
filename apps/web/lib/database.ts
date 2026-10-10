import { Pool, type PoolClient } from "pg";

declare global {
  var checkAmPool: Pool | undefined;
  var checkAmSchemaReady: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to connect to PostgreSQL.");
  }

  globalThis.checkAmPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  return globalThis.checkAmPool;
}

async function initializeSchema(client: Pool | PoolClient): Promise<void> {
  await client.query(`
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
  `);
}

async function ensureSchema(): Promise<void> {
  const pool = getPool();
  globalThis.checkAmSchemaReady ??= initializeSchema(pool).catch((error: unknown) => {
    globalThis.checkAmSchemaReady = undefined;
    throw error;
  });
  await globalThis.checkAmSchemaReady;
}

export async function recordAnalyticsEvent(
  event: "page_view" | "imei_check_attempted" | "full_report_click",
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO analytics_events (event_name) VALUES ($1)",
    [event],
  );
}

export async function saveWaitlistSignup(input: {
  email: string;
  phone: string | null;
  feature: string;
}): Promise<void> {
  const pool = getPool();
  await ensureSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO waitlist_signups (email, phone, preferred_feature)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET phone = EXCLUDED.phone,
           preferred_feature = EXCLUDED.preferred_feature,
           updated_at = NOW()`,
      [input.email, input.phone, input.feature],
    );
    await insertEvent(client, "waitlist_signup");
    await insertEvent(client, "feature_preference", { feature: input.feature });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertEvent(
  client: PoolClient,
  event: "waitlist_signup" | "feature_preference",
  properties: Record<string, string> = {},
): Promise<void> {
  await client.query(
    "INSERT INTO analytics_events (event_name, properties) VALUES ($1, $2::jsonb)",
    [event, JSON.stringify(properties)],
  );
}
