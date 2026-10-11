import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTacCsv } from "@/lib/tac-csv";

const fixture = readFileSync(
  resolve(process.cwd(), "tests/fixtures/tac.csv"),
  "utf8",
);

describe("TAC CSV import parsing", () => {
  it("parses quoted fields, keeps the last valid duplicate, and skips invalid rows", () => {
    const parsed = parseTacCsv(fixture);

    expect(parsed.totalRows).toBe(5);
    expect(parsed.duplicateRows).toBe(1);
    expect(parsed.invalidRows).toBe(2);
    expect(parsed.rows).toEqual([
      { tac: "12345678", brand: "Acme", model: "Aster 1 Plus" },
      { tac: "87654321", brand: 'Brand "Two"', model: "Model, Pro" },
    ]);
  });

  it("rejects files without the required columns", () => {
    expect(() => parseTacCsv("tac,brand\n12345678,Acme")).toThrow(
      "TAC CSV header must include tac, brand, and model columns.",
    );
  });
});
