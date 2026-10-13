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

    ALTER TABLE payments ADD COLUMN IF NOT EXISTS tac CHAR(8);

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
      DROP COLUMN IF EXISTS seller_phone;

    DO $$
    DECLARE constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_proof_requests'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%responded_at%'
      LOOP
        EXECUTE format(
          'ALTER TABLE seller_proof_requests DROP CONSTRAINT %I',
          constraint_name
        );
      END LOOP;
    END $$;

    CREATE INDEX IF NOT EXISTS seller_proof_requests_payment_created_idx
      ON seller_proof_requests (payment_reference, created_at DESC);
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

export type PaymentStatus = "pending" | "success" | "failed";

export interface PaymentRecord {
  reference: string;
  amount: number;
  status: PaymentStatus;
  createdAt: Date;
  tac: string | null;
  imeiLast4: string | null;
  imeiFormatValid: boolean | null;
  imeiLuhnValid: boolean | null;
}

export interface SellerProofStatus {
  requested: boolean;
  respondedAt: Date | null;
  proofId: string | null;
  proofMime: string | null;
}

export async function createPendingPayment(input: {
  reference: string;
  email: string;
  imeiHash: string | null;
  tac: string | null;
  imeiLast4: string | null;
  imeiFormatValid: boolean | null;
  imeiLuhnValid: boolean | null;
}): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `UPDATE payments
     SET status = 'failed'
     WHERE status = 'pending'
       AND created_at <= NOW() - INTERVAL '30 minutes'`,
  );
  await pool.query(
    `INSERT INTO payments
       (reference, amount, status, email, imei_hash, tac, imei_last4, imei_format_valid, imei_luhn_valid)
     VALUES ($1, 50000, 'pending', $2, $3, $4, $5, $6, $7)`,
    [
      input.reference,
      input.email,
      input.imeiHash,
      input.tac,
      input.imeiLast4,
      input.imeiFormatValid,
      input.imeiLuhnValid,
    ],
  );
}

export async function getPaymentByReference(
  reference: string,
): Promise<PaymentRecord | null> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `UPDATE payments
     SET status = 'failed'
     WHERE reference = $1
       AND status = 'pending'
       AND created_at <= NOW() - INTERVAL '30 minutes'`,
    [reference],
  );
  const result = await pool.query<{
    reference: string;
    amount: number;
    status: PaymentStatus;
    created_at: Date;
    tac: string | null;
    imei_last4: string | null;
    imei_format_valid: boolean | null;
    imei_luhn_valid: boolean | null;
  }>(
    `SELECT reference, amount, status, created_at, tac, imei_last4, imei_format_valid, imei_luhn_valid
     FROM payments
     WHERE reference = $1`,
    [reference],
  );
  const payment = result.rows[0];
  return payment
    ? {
        reference: payment.reference,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.created_at,
        tac: payment.tac?.trimEnd() ?? null,
        imeiLast4: payment.imei_last4,
        imeiFormatValid: payment.imei_format_valid,
        imeiLuhnValid: payment.imei_luhn_valid,
      }
    : null;
}

export async function createSellerProofRequest(input: {
  id: string;
  paymentReference: string;
  tokenHash: string;
}): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO seller_proof_requests (id, payment_reference, token_hash)
     SELECT $1, reference, $3
     FROM payments
     WHERE reference = $2 AND status = 'success'
     RETURNING id`,
    [input.id, input.paymentReference, input.tokenHash],
  );
  return result.rowCount === 1;
}

export async function getSellerProofStatus(
  paymentReference: string,
): Promise<SellerProofStatus> {
  await ensureSchema();
  const result = await getPool().query<{
    requested: boolean;
    responded_at: Date | null;
    proof_id: string | null;
    proof_mime: string | null;
  }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM seller_proof_requests
         WHERE payment_reference = $1
       ) AS requested,
       (SELECT responded_at FROM seller_proof_requests
        WHERE payment_reference = $1 AND responded_at IS NOT NULL
        ORDER BY responded_at DESC LIMIT 1) AS responded_at,
       (SELECT id FROM seller_proof_requests
        WHERE payment_reference = $1
          AND responded_at IS NOT NULL
          AND proof_data IS NOT NULL
        ORDER BY responded_at DESC LIMIT 1) AS proof_id,
       (SELECT proof_mime FROM seller_proof_requests
        WHERE payment_reference = $1
          AND responded_at IS NOT NULL
          AND proof_data IS NOT NULL
        ORDER BY responded_at DESC LIMIT 1) AS proof_mime`,
    [paymentReference],
  );
  const status = result.rows[0];
  return {
    requested: status?.requested ?? false,
    respondedAt: status?.responded_at ?? null,
    proofId: status?.proof_id ?? null,
    proofMime: status?.proof_mime ?? null,
  };
}

export async function submitSellerProof(input: {
  tokenHash: string;
  proofMime: "image/jpeg";
  proofData: Buffer;
}): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE seller_proof_requests
     SET proof_mime = $2,
         proof_data = $3,
         responded_at = NOW()
     WHERE token_hash = $1 AND responded_at IS NULL
     RETURNING id`,
    [input.tokenHash, input.proofMime, input.proofData],
  );
  return result.rowCount === 1;
}

export async function getSellerProofFile(input: {
  paymentReference: string;
  proofId: string;
}): Promise<{ mime: string; data: Buffer } | null> {
  await ensureSchema();
  const result = await getPool().query<{
    proof_mime: string;
    proof_data: Buffer;
  }>(
    `SELECT proof_mime, proof_data
     FROM seller_proof_requests
     INNER JOIN payments ON payments.reference = seller_proof_requests.payment_reference
     WHERE payments.reference = $1
       AND payments.status = 'success'
       AND seller_proof_requests.id = $2
       AND seller_proof_requests.responded_at IS NOT NULL
       AND seller_proof_requests.proof_data IS NOT NULL`,
    [input.paymentReference, input.proofId],
  );
  const proof = result.rows[0];
  return proof ? { mime: proof.proof_mime, data: proof.proof_data } : null;
}

export async function purgeExpiredSellerProofAttachments(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE seller_proof_requests
     SET proof_data = NULL, proof_mime = NULL
     WHERE responded_at <= NOW() - INTERVAL '30 days'
       AND proof_data IS NOT NULL`,
  );
  return result.rowCount ?? 0;
}

export async function findTacModel(
  tac: string,
): Promise<{ brand: string | null; model: string | null } | null> {
  await ensureSchema();
  const result = await getPool().query<{
    brand: string | null;
    model: string | null;
  }>(
    "SELECT brand, model FROM tac_models WHERE tac = $1",
    [tac],
  );
  return result.rows[0] ?? null;
}

export async function markPaymentSuccessful(
  reference: string,
): Promise<PaymentStatus | null> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `UPDATE payments
     SET status = 'success', paid_at = NOW()
     WHERE reference = $1
       AND status = 'pending'
       AND created_at > NOW() - INTERVAL '30 minutes'`,
    [reference],
  );
  return getPaymentStatus(reference);
}

export async function markPaymentFailed(
  reference: string,
): Promise<PaymentStatus | null> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `UPDATE payments
     SET status = 'failed'
     WHERE reference = $1
       AND status = 'pending'`,
    [reference],
  );
  return getPaymentStatus(reference);
}

async function getPaymentStatus(
  reference: string,
): Promise<PaymentStatus | null> {
  const result = await getPool().query<{ status: PaymentStatus }>(
    "SELECT status FROM payments WHERE reference = $1",
    [reference],
  );
  return result.rows[0]?.status ?? null;
}

export async function consumePaymentRateLimit(input: {
  scope: string;
  clientHash: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `DELETE FROM payment_rate_limits
     WHERE window_started_at < NOW() - INTERVAL '2 hours'`,
  );
  const result = await pool.query<{ request_count: number }>(
    `INSERT INTO payment_rate_limits
       (scope, client_hash, window_started_at, request_count)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (scope, client_hash) DO UPDATE
     SET window_started_at = CASE
           WHEN payment_rate_limits.window_started_at <=
             NOW() - ($3 * INTERVAL '1 second')
             THEN NOW()
           ELSE payment_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN payment_rate_limits.window_started_at <=
             NOW() - ($3 * INTERVAL '1 second')
             THEN 1
           ELSE payment_rate_limits.request_count + 1
         END
     RETURNING request_count`,
    [input.scope, input.clientHash, input.windowSeconds],
  );
  return (result.rows[0]?.request_count ?? input.maxRequests + 1) <=
    input.maxRequests;
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
