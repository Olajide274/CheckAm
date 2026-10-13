import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importTacCsv } from "../scripts/import-tac";

const db = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    connect: db.connect,
    end: db.end,
  })),
}));

const supplementFixture = resolve(
  process.cwd(),
  "tests/fixtures/tac-supplement.csv",
);
const originalDatabaseUrl = process.env.DATABASE_URL;

describe("TAC CSV importer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue({
      query: db.query,
      release: db.release,
    });
    db.query.mockResolvedValue({ rows: [], rowCount: 1 });
    db.end.mockResolvedValue(undefined);
    process.env.DATABASE_URL = "postgresql://test.invalid/checkam";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.restoreAllMocks();
  });

  it("lets supplements replace any TAC row and prevents Osmocom overwrites", async () => {
    await importTacCsv(supplementFixture, "supplement");

    const upsert = db.query.mock.calls.find(([query]) =>
      String(query).includes("INSERT INTO tac_models"),
    );
    expect(upsert).toBeDefined();
    expect(String(upsert?.[0])).toContain("ON CONFLICT (tac) DO UPDATE");
    expect(String(upsert?.[0])).toContain(
      "WHERE COALESCE(tac_models.source, '') NOT LIKE 'supplement:%'",
    );
    expect(String(upsert?.[0])).toContain(
      "OR EXCLUDED.source LIKE 'supplement:%'",
    );
    expect(upsert?.[1]).toContain("supplement:Local test source");
    expect(vi.mocked(console.info)).toHaveBeenCalledWith(
      "TAC import complete (supplement): upserted 2, skipped invalid 2, duplicates 1, rows 5.",
    );
  });
});
