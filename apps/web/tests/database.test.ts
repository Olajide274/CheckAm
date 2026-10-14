// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseQuery = vi.hoisted(() => vi.fn());
const originalDatabaseUrl = process.env.DATABASE_URL;

vi.mock("pg", () => ({
  Pool: class {
    query = databaseQuery;
  },
}));

import {
  getPaymentsSummary,
  purgeExpiredSellerProofAttachments,
} from "@/lib/database";

describe("database schema bootstrap", () => {
  beforeEach(() => {
    databaseQuery.mockReset().mockResolvedValue({ rowCount: 3 });
    globalThis.checkAmPool = undefined;
    globalThis.checkAmSchemaReady = undefined;
    process.env.DATABASE_URL = "postgres://localhost/checkam";
  });

  afterEach(() => {
    globalThis.checkAmPool = undefined;
    globalThis.checkAmSchemaReady = undefined;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("upgrades an older-shaped schema before payment and Seller Proof use", async () => {
    await purgeExpiredSellerProofAttachments();

    const schemaQuery = databaseQuery.mock.calls[0]?.[0] as string;
    expect(schemaQuery).toContain("CREATE TABLE IF NOT EXISTS tac_models");
    expect(schemaQuery).toContain(
      "CREATE TABLE IF NOT EXISTS payment_rate_limits",
    );
    expect(schemaQuery).toContain(
      "CREATE TABLE IF NOT EXISTS seller_proof_requests",
    );
    for (const column of [
      "imei_format_valid BOOLEAN",
      "imei_luhn_valid BOOLEAN",
      "tac CHAR(8)",
      "request_count INTEGER",
      "responded_at TIMESTAMPTZ",
      "proof_data BYTEA",
      "proof_mime TEXT",
      "tac CHAR(8)",
      "source TEXT",
      "imported_at TIMESTAMPTZ DEFAULT NOW()",
    ]) {
      expect(schemaQuery).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it("clears expired attachment data and MIME types after ensuring the schema", async () => {
    await expect(purgeExpiredSellerProofAttachments()).resolves.toBe(3);

    expect(databaseQuery).toHaveBeenCalledTimes(2);
    const retentionQuery = databaseQuery.mock.calls[1]?.[0] as string;
    expect(retentionQuery).toContain("SET proof_data = NULL, proof_mime = NULL");
    expect(retentionQuery).toContain("NOW() - INTERVAL '30 days'");
    expect(retentionQuery).toContain("AND proof_data IS NOT NULL");
  });

  it("returns only aggregate payment data for the summary", async () => {
    databaseQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ status: "success", payment_count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ day: "2026-10-14", payment_count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ amount_kobo: "100000" }] });

    await expect(getPaymentsSummary()).resolves.toEqual({
      byStatus: [{ status: "success", count: 2 }],
      byDay: [{ day: "2026-10-14", count: 2 }],
      successfulAmountKobo: "100000",
    });

    for (const [query] of databaseQuery.mock.calls.slice(1)) {
      expect(String(query)).not.toMatch(/email|imei/i);
    }
  });
});
