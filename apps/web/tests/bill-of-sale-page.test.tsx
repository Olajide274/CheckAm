import { afterEach, describe, expect, it, vi } from "vitest";
import BillOfSalePage from "@/app/bill-of-sale/page";

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
  it("returns not found when the feature flag is unset", () => {
    delete process.env.FEATURE_BILL_OF_SALE;

    expect(() => BillOfSalePage()).toThrow("NEXT_NOT_FOUND");
  });

  it("renders only when the feature flag is enabled", () => {
    process.env.FEATURE_BILL_OF_SALE = "true";

    expect(BillOfSalePage()).toBeDefined();
  });
});
