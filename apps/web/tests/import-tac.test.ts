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
const osmocomFixture = resolve(process.cwd(), "tests/fixtures/tac.csv");
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

  it("keeps Osmocom authoritative while letting Osmocom replace supplements", async () => {
    await importTacCsv(supplementFixture, "supplement");

    const supplementInsert = db.query.mock.calls.find(([query]) =>
      String(query).includes("INSERT INTO tac_models"),
    );
    expect(supplementInsert).toBeDefined();
    expect(String(supplementInsert?.[0])).toContain(
      "ON CONFLICT (tac) DO NOTHING",
    );
    expect(String(supplementInsert?.[0])).not.toContain("DO UPDATE");
    expect(supplementInsert?.[1]).toContain("supplement:Local test source");
    expect(vi.mocked(console.info)).toHaveBeenCalledWith(
      "TAC import complete (supplement): inserted 1, skipped invalid 2, duplicates 1, rows 5.",
    );

    const callsBeforeOsmocom = db.query.mock.calls.length;
    await importTacCsv(osmocomFixture, "osmocom");
    const osmocomInsert = db.query.mock.calls
      .slice(callsBeforeOsmocom)
      .find(([query]) => String(query).includes("INSERT INTO tac_models"));
    expect(osmocomInsert).toBeDefined();
    expect(String(osmocomInsert?.[0])).toContain(
      "ON CONFLICT (tac) DO UPDATE",
    );
    expect(String(osmocomInsert?.[0])).toContain(
      "source = EXCLUDED.source",
    );
    expect(
      (osmocomInsert?.[1] as string[]).filter((_, index) => index % 4 === 3),
    ).toEqual(["Osmocom TAC database", "Osmocom TAC database"]);
  });
});
