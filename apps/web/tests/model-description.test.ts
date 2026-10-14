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

  it("compares recognised brands when the TAC has no usable model", () => {
    const itel = { status: "brand_only" as const, brand: "ITEL" };

    expect(compareSellerDescription("ITEL", itel)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("itel A-series phone", itel)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("Samsung phone", itel)).toBe(
      "Does not match the seller's description",
    );
    expect(compareSellerDescription("iPhone 12", itel)).toBe(
      "Does not match the seller's description",
    );
    expect(compareSellerDescription("phone, model unknown", itel)).toBe(
      "Cannot tell",
    );
  });

  it("recognises the configured brand aliases", () => {
    const samsung = { status: "brand_only" as const, brand: "Samsung" };
    const xiaomi = { status: "brand_only" as const, brand: "Xiaomi" };
    const google = { status: "brand_only" as const, brand: "Google" };

    expect(compareSellerDescription("Galaxy phone", samsung)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("Redmi Note", xiaomi)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("Poco phone", xiaomi)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("Pixel phone", google)).toBe(
      "Brand matches; model cannot be checked",
    );
    expect(compareSellerDescription("Techno phone", {
      status: "brand_only",
      brand: "Tecno",
    })).toBe("Brand matches; model cannot be checked");
  });
});
