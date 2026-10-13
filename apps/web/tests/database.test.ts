// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseQuery = vi.hoisted(() => vi.fn());
const originalDatabaseUrl = process.env.DATABASE_URL;

vi.mock("pg", () => ({
  Pool: class {
    query = databaseQuery;
  },
}));

import { purgeExpiredSellerProofAttachments } from "@/lib/database";

describe("Seller Proof retention", () => {
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

  it("clears expired attachment data and MIME types after ensuring the schema", async () => {
    await expect(purgeExpiredSellerProofAttachments()).resolves.toBe(3);

    expect(databaseQuery).toHaveBeenCalledTimes(2);
    const retentionQuery = databaseQuery.mock.calls[1]?.[0] as string;
    expect(retentionQuery).toContain("SET proof_data = NULL, proof_mime = NULL");
    expect(retentionQuery).toContain("NOW() - INTERVAL '30 days'");
    expect(retentionQuery).toContain("AND proof_data IS NOT NULL");
  });
});
