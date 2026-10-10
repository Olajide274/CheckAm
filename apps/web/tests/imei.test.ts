import { describe, expect, it } from "vitest";
import { isValidImei } from "@/lib/imei";

describe("isValidImei", () => {
  it("accepts a 15-digit IMEI with a valid Luhn checksum", () => {
    expect(isValidImei("490154203237518")).toBe(true);
  });

  it.each([
    "",
    "49015420323751",
    "490154203237519",
    "49015420323751a",
    "4901542032375180",
  ])("rejects an invalid IMEI: %s", (imei) => {
    expect(isValidImei(imei)).toBe(false);
  });
});
