import { beforeEach, describe, expect, it, vi } from "vitest";
import { findTacModel } from "@/lib/database";
import { modelLookup } from "@/lib/model-lookup";

vi.mock("@/lib/database", () => ({
  findTacModel: vi.fn(),
}));

describe("TAC model lookup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored brand and model for a matching TAC", async () => {
    vi.mocked(findTacModel).mockResolvedValue({
      brand: "Acme",
      model: "Aster 1 Plus",
    });

    await expect(modelLookup.lookup("12345678")).resolves.toEqual({
      status: "found",
      brand: "Acme",
      model: "Aster 1 Plus",
    });
  });

  it("returns not_found when the TAC has no usable model row", async () => {
    vi.mocked(findTacModel).mockResolvedValue(null);

    await expect(modelLookup.lookup("87654321")).resolves.toEqual({
      status: "not_found",
      brand: null,
      model: null,
    });
  });

  it.each([
    { brand: "ITEL", model: "ITEL" },
    { brand: "Acme", model: "a.c-m e" },
    { brand: "Acme", model: "" },
  ])("returns brand_only for low-quality model data: $brand / $model", async ({
    brand,
    model,
  }) => {
    vi.mocked(findTacModel).mockResolvedValue({ brand, model });

    await expect(modelLookup.lookup("12345678")).resolves.toEqual({
      status: "brand_only",
      brand,
    });
  });

  it.each(["N1", "P9", "X5"])(
    "keeps short specific model %s",
    async (model) => {
      vi.mocked(findTacModel).mockResolvedValue({ brand: "Acme", model });

      await expect(modelLookup.lookup("12345678")).resolves.toEqual({
        status: "found",
        brand: "Acme",
        model,
      });
    },
  );

  it("does not query the data source for malformed TAC values", async () => {
    await expect(modelLookup.lookup("1234")).resolves.toEqual({
      status: "not_found",
      brand: null,
      model: null,
    });
    expect(findTacModel).not.toHaveBeenCalled();
  });
});
