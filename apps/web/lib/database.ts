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

export interface TacModelImportRow {
  tac: string;
  brand: string;
  model: string;
  source: string;
}

export async function importTacModelBatch(
  client: PoolClient,
  rows: readonly TacModelImportRow[],
  format: "osmocom" | "supplement",
): Promise<number> {
  const values: string[] = [];
  const placeholders = rows.map((row, index) => {
    const start = index * 4;
    values.push(row.tac, row.brand, row.model, row.source);
    return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4})`;
  });
  const conflictHandling =
    format === "supplement"
      ? "ON CONFLICT (tac) DO NOTHING"
      : `ON CONFLICT (tac) DO UPDATE
         SET brand = EXCLUDED.brand,
             model = EXCLUDED.model,
             source = EXCLUDED.source,
             imported_at = NOW()`;
  const result = await client.query(
    `INSERT INTO tac_models (tac, brand, model, source)
     VALUES ${placeholders.join(", ")}
     ${conflictHandling}`,
    values,
  );
  if (result.rowCount === null) {
    throw new Error("TAC import did not report the number of rows written.");
  }
  return result.rowCount;
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

export type AccountRole = "buyer" | "seller";
export type AccountPlan = "free" | "premium" | "pro";

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  username: string | null;
  phone: string | null;
  role: AccountRole;
  plan: AccountPlan;
  emailVerified: boolean;
  createdAt: Date;
}

export type AccountProfile = Omit<AccountRecord, "passwordHash">;

function mapAccount(row: {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  username: string | null;
  phone: string | null;
  role: AccountRole;
  plan: AccountPlan;
  email_verified: boolean;
  created_at: Date;
}): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    username: row.username,
    phone: row.phone,
    role: row.role,
    plan: row.plan,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

function toAccountProfile(account: AccountRecord): AccountProfile {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    username: account.username,
    phone: account.phone,
    role: account.role,
    plan: account.plan,
    emailVerified: account.emailVerified,
    createdAt: account.createdAt,
  };
}

export async function createAccount(input: {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  username: string | null;
  phone: string | null;
  role: AccountRole;
}): Promise<AccountProfile> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    username: string | null;
    phone: string | null;
    role: AccountRole;
    plan: AccountPlan;
    email_verified: boolean;
    created_at: Date;
  }>(
    `INSERT INTO user_accounts
       (id, email, password_hash, full_name, username, phone, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, password_hash, full_name, username, phone,
               role, plan, email_verified, created_at`,
    [
      input.id,
      input.email,
      input.passwordHash,
      input.fullName,
      input.username,
      input.phone,
      input.role,
    ],
  );
  const account = mapAccount(result.rows[0]!);
  return toAccountProfile(account);
}

export async function getAccountByEmail(
  email: string,
): Promise<AccountRecord | null> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    username: string | null;
    phone: string | null;
    role: AccountRole;
    plan: AccountPlan;
    email_verified: boolean;
    created_at: Date;
  }>(
    `SELECT id, email, password_hash, full_name, username, phone, role, plan,
            email_verified, created_at
     FROM user_accounts
     WHERE email = $1`,
    [email],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function createAccountSession(input: {
  tokenHash: string;
  accountId: string;
  expiresAt: Date;
}): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM account_sessions WHERE expires_at <= NOW()");
  await pool.query(
    `INSERT INTO account_sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, $3)`,
    [input.tokenHash, input.accountId, input.expiresAt],
  );
}

export async function getAccountBySessionToken(
  tokenHash: string,
): Promise<AccountProfile | null> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    username: string | null;
    phone: string | null;
    role: AccountRole;
    plan: AccountPlan;
    email_verified: boolean;
    created_at: Date;
  }>(
    `SELECT accounts.id, accounts.email, accounts.password_hash,
            accounts.full_name, accounts.username, accounts.phone,
            accounts.role, accounts.plan,
            accounts.email_verified, accounts.created_at
     FROM account_sessions AS sessions
     INNER JOIN user_accounts AS accounts ON accounts.id = sessions.account_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [tokenHash],
  );
  if (!result.rows[0]) return null;
  return toAccountProfile(mapAccount(result.rows[0]));
}

export async function deleteAccountSession(tokenHash: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "DELETE FROM account_sessions WHERE token_hash = $1",
    [tokenHash],
  );
}

export async function updateAccountSettings(input: {
  accountId: string;
  fullName: string;
  username: string | null;
  phone: string | null;
  passwordHash?: string;
}): Promise<AccountProfile> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    username: string | null;
    phone: string | null;
    role: AccountRole;
    plan: AccountPlan;
    email_verified: boolean;
    created_at: Date;
  }>(
    `UPDATE user_accounts
     SET full_name = $2,
         username = $3,
         phone = $4,
         password_hash = COALESCE($5, password_hash)
     WHERE id = $1
     RETURNING id, email, password_hash, full_name, username, phone,
               role, plan, email_verified, created_at`,
    [
      input.accountId,
      input.fullName,
      input.username,
      input.phone,
      input.passwordHash ?? null,
    ],
  );
  if (!result.rows[0]) throw new Error("Account settings update matched no account.");
  return toAccountProfile(mapAccount(result.rows[0]));
}

export async function createEmailVerificationToken(input: {
  tokenHash: string;
  accountId: string;
  expiresAt: Date;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "DELETE FROM account_email_verification_tokens WHERE expires_at <= NOW()",
  );
  await getPool().query(
    `INSERT INTO account_email_verification_tokens (token_hash, account_id, expires_at)
     VALUES ($1, $2, $3)`,
    [input.tokenHash, input.accountId, input.expiresAt],
  );
}

export async function verifyAccountEmail(tokenHash: string): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `WITH token AS (
       DELETE FROM account_email_verification_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING account_id
     )
     UPDATE user_accounts
     SET email_verified = TRUE
     WHERE id = (SELECT account_id FROM token)
     RETURNING id`,
    [tokenHash],
  );
  return result.rowCount === 1;
}

export async function consumeAccountRateLimit(input: {
  scope: string;
  identifierHash: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<boolean> {
  await ensureSchema();
  await getPool().query(
    "DELETE FROM account_rate_limits WHERE window_started_at < NOW() - INTERVAL '24 hours'",
  );
  const result = await getPool().query<{ request_count: number }>(
    `INSERT INTO account_rate_limits
       (scope, identifier_hash, window_started_at, request_count)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (scope, identifier_hash) DO UPDATE
     SET window_started_at = CASE
           WHEN account_rate_limits.window_started_at <=
             NOW() - ($3 * INTERVAL '1 second')
             THEN NOW()
           ELSE account_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN account_rate_limits.window_started_at <=
             NOW() - ($3 * INTERVAL '1 second')
             THEN 1
           ELSE account_rate_limits.request_count + 1
         END
     RETURNING request_count`,
    [input.scope, input.identifierHash, input.windowSeconds],
  );
  return (result.rows[0]?.request_count ?? input.maxRequests + 1) <=
    input.maxRequests;
}

export type AccountUsageAction = "bill_of_sale";

export async function consumeAccountUsage(input: {
  accountId: string;
  action: AccountUsageAction;
  limit: number;
}): Promise<{ allowed: boolean; used: number }> {
  await ensureSchema();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [input.accountId],
    );
    const countResult = await client.query<{ usage_count: string }>(
      `SELECT COUNT(*)::text AS usage_count
       FROM account_usage
       WHERE account_id = $1
         AND action = $2
         AND used_at > NOW() - INTERVAL '30 days'`,
      [input.accountId, input.action],
    );
    const used = Number(countResult.rows[0]?.usage_count ?? "0");
    if (used >= input.limit) {
      await client.query("ROLLBACK");
      return { allowed: false, used };
    }
    await client.query(
      "INSERT INTO account_usage (account_id, action) VALUES ($1, $2)",
      [input.accountId, input.action],
    );
    await client.query("COMMIT");
    return { allowed: true, used: used + 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAccountUsageCount(input: {
  accountId: string;
  action: AccountUsageAction;
}): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ usage_count: string }>(
    `SELECT COUNT(*)::text AS usage_count
     FROM account_usage
     WHERE account_id = $1
       AND action = $2
       AND used_at > NOW() - INTERVAL '30 days'`,
    [input.accountId, input.action],
  );
  return Number(result.rows[0]?.usage_count ?? "0");
}

export async function getAccountReportUsageCount(
  accountId: string,
): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ payment_count: string }>(
    `SELECT COUNT(*)::text AS payment_count
     FROM payments
     WHERE account_id = $1
       AND (
         (status = 'success' AND created_at > NOW() - INTERVAL '30 days')
         OR (status = 'pending' AND created_at > NOW() - INTERVAL '30 minutes')
       )`,
    [accountId],
  );
  return Number(result.rows[0]?.payment_count ?? "0");
}

export async function createPendingPayment(input: {
  reference: string;
  email: string;
  accountId?: string | null;
  freeReportLimit?: number;
  imeiHash: string | null;
  tac: string | null;
  imeiLast4: string | null;
  imeiFormatValid: boolean | null;
  imeiLuhnValid: boolean | null;
}): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE payments
       SET status = 'failed'
       WHERE status = 'pending'
         AND created_at <= NOW() - INTERVAL '30 minutes'`,
    );
    if (input.accountId && input.freeReportLimit !== undefined) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [input.accountId],
      );
      const usage = await client.query<{ payment_count: string }>(
        `SELECT COUNT(*)::text AS payment_count
         FROM payments
         WHERE account_id = $1
           AND (
             (status = 'success' AND created_at > NOW() - INTERVAL '30 days')
             OR (status = 'pending' AND created_at > NOW() - INTERVAL '30 minutes')
           )`,
        [input.accountId],
      );
      if (
        Number(usage.rows[0]?.payment_count ?? "0") >= input.freeReportLimit
      ) {
        await client.query("ROLLBACK");
        return false;
      }
    }
    await client.query(
      `INSERT INTO payments
         (reference, amount, status, email, account_id, imei_hash, tac, imei_last4, imei_format_valid, imei_luhn_valid)
       VALUES ($1, 50000, 'pending', $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.reference,
        input.email,
        input.accountId ?? null,
        input.imeiHash,
        input.tac,
        input.imeiLast4,
        input.imeiFormatValid,
        input.imeiLuhnValid,
      ],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export interface PaymentsSummary {
  byStatus: Array<{ status: PaymentStatus; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  successfulAmountKobo: string;
}

export async function getPaymentsSummary(): Promise<PaymentsSummary> {
  await ensureSchema();
  const pool = getPool();
  const [statusResult, dayResult, amountResult] = await Promise.all([
    pool.query<{ status: PaymentStatus; payment_count: string }>(
      `SELECT status, COUNT(*)::text AS payment_count
       FROM payments
       GROUP BY status
       ORDER BY status`,
    ),
    pool.query<{ day: string; payment_count: string }>(
      `SELECT created_at::date::text AS day, COUNT(*)::text AS payment_count
       FROM payments
       GROUP BY created_at::date
       ORDER BY created_at::date`,
    ),
    pool.query<{ amount_kobo: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS amount_kobo
       FROM payments
       WHERE status = 'success'`,
    ),
  ]);

  return {
    byStatus: statusResult.rows.map((row) => ({
      status: row.status,
      count: Number(row.payment_count),
    })),
    byDay: dayResult.rows.map((row) => ({
      day: row.day,
      count: Number(row.payment_count),
    })),
    successfulAmountKobo: amountResult.rows[0]?.amount_kobo ?? "0",
  };
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
