import { afterEach, describe, expect, it, vi } from "vitest";
import BillOfSalePage from "@/app/bill-of-sale/page";

const database = vi.hoisted(() => ({
  getAccountBySessionToken: vi.fn(),
  consumeAccountUsage: vi.fn(),
}));

vi.mock("@/lib/database", () => database);

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const originalBillOfSaleFlag = process.env.FEATURE_BILL_OF_SALE;

afterEach(() => {
  if (originalBillOfSaleFlag === undefined) {
    delete process.env.FEATURE_BILL_OF_SALE;
  } else {
    process.env.FEATURE_BILL_OF_SALE = originalBillOfSaleFlag;
  }
});

describe("bill of sale route", () => {
  it("returns not found when the feature flag is unset", async () => {
    delete process.env.FEATURE_BILL_OF_SALE;

    await expect(BillOfSalePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders only when the feature flag is enabled", async () => {
    process.env.FEATURE_BILL_OF_SALE = "true";

    await expect(BillOfSalePage()).resolves.toBeDefined();
  });
});
