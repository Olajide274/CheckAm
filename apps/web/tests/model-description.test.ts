import { describe, expect, it } from "vitest";
import { compareSellerDescription } from "@/lib/model-description";

const model = {
  status: "found" as const,
  brand: "Acme",
  model: "Aster 1 Plus",
};

describe("seller description comparison", () => {
  it("matches case-insensitive descriptions by normalized tokens", () => {
    expect(compareSellerDescription("ACME Aster-1 Plus phone", model)).toBe(
      "Matches the seller's description",
    );
  });

  it("reports no overlap as a mismatch", () => {
    expect(compareSellerDescription("Other brand model", model)).toBe(
      "Does not match the seller's description",
    );
  });

  it("returns cannot tell for partial, empty, or unavailable model data", () => {
    expect(compareSellerDescription("Acme Aster", model)).toBe("Cannot tell");
    expect(compareSellerDescription("  ", model)).toBe("Cannot tell");
    expect(
      compareSellerDescription("Acme Aster 1 Plus", {
        status: "not_found",
        brand: null,
        model: null,
      }),
    ).toBe("Cannot tell");
  });
});
