import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTacCsv, parseTacSupplementCsv } from "@/lib/tac-csv";

const osmocomFixture = readFileSync(
  resolve(process.cwd(), "tests/fixtures/tac.csv"),
  "utf8",
);
const supplementFixture = readFileSync(
  resolve(process.cwd(), "tests/fixtures/tac-supplement.csv"),
  "utf8",
);

describe("TAC CSV import parsing", () => {
  it("skips the license line, maps duplicate name columns by position, and ignores trailing columns", () => {
    const parsed = parseTacCsv(osmocomFixture);

    expect(parsed.totalRows).toBe(5);
    expect(parsed.duplicateRows).toBe(1);
    expect(parsed.invalidRows).toBe(2);
    expect(parsed.rows).toEqual([
      { tac: "12345678", brand: "Acme", model: "Aster 1 Plus" },
      { tac: "87654321", brand: 'Brand "Two"', model: "Model, Pro" },
    ]);
  });

  it("maps Nigerian supplement columns, keeps the last duplicate and counts invalid rows", () => {
    const parsed = parseTacSupplementCsv(supplementFixture);

    expect(parsed.totalRows).toBe(5);
    expect(parsed.duplicateRows).toBe(1);
    expect(parsed.invalidRows).toBe(2);
    expect(parsed.rows).toEqual([
      {
        tac: "12345678",
        brand: "Acme",
        model: "Aster 1 Plus",
        source: "Local test source",
      },
      { tac: "87654321", brand: "Example Mobile", model: "Model Two" },
    ]);
  });

  it("rejects files without the required columns", () => {
    expect(() => parseTacCsv("License terms\ntac,brand\n12345678,Acme")).toThrow(
      "TAC CSV header must begin with tac,name,name columns.",
    );
  });

  it("rejects supplement files without the required columns", () => {
    expect(() =>
      parseTacSupplementCsv("tac,brand\n12345678,Acme"),
    ).toThrow(
      "TAC supplement CSV header must be tac,brand,model with optional source.",
    );
  });
});
