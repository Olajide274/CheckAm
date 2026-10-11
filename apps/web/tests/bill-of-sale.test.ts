import { describe, expect, it } from "vitest";
import {
  createBillOfSaleShareUrl,
  isValidBillOfSale,
  readBillOfSaleShareHash,
  type BillOfSaleData,
  validateBillOfSale,
} from "@/lib/bill-of-sale";
import { isBillOfSaleEnabled, resolveBillOfSaleFlag } from "@/lib/features";

const validBill: BillOfSaleData = {
  sellerName: "Ada Seller",
  sellerPhone: "+2348000000001",
  buyerName: "Bola Buyer",
  buyerPhone: "+2348000000002",
  deviceType: "Phone",
  brand: "Example",
  model: "Model 1",
  identifierType: "IMEI",
  identifier: "490154203237518",
  agreedPrice: "250000.50",
  date: "2026-10-10",
  conditionNotes: "Small mark on the case",
};

describe("bill of sale validation", () => {
  it("accepts a complete agreement with a valid IMEI checksum", () => {
    expect(isValidBillOfSale(validBill)).toBe(true);
  });

  it("rejects malformed IMEIs and reports the field error", () => {
    expect(
      validateBillOfSale({ ...validBill, identifier: "490154203237519" }).identifier,
    ).toBe("Enter a valid 15-digit IMEI.");
  });

  it("accepts a non-empty serial number without applying IMEI rules", () => {
    expect(
      isValidBillOfSale({
        ...validBill,
        identifierType: "Serial number",
        identifier: "SN-ABC-123",
      }),
    ).toBe(true);
  });

  it("rejects missing names, phone numbers, device details, and invalid prices", () => {
    const errors = validateBillOfSale({
      ...validBill,
      sellerName: "",
      buyerName: " ",
      sellerPhone: "not a phone",
      buyerPhone: "",
      brand: "",
      model: "",
      agreedPrice: "-1",
    });

    expect(errors).toHaveProperty("sellerName");
    expect(errors).toHaveProperty("buyerName");
    expect(errors).toHaveProperty("sellerPhone");
    expect(errors).toHaveProperty("buyerPhone");
    expect(errors).toHaveProperty("brand");
    expect(errors).toHaveProperty("model");
    expect(errors).toHaveProperty("agreedPrice");
  });

  it("rejects impossible calendar dates", () => {
    expect(validateBillOfSale({ ...validBill, date: "2026-02-30" })).toHaveProperty("date");
  });
});

describe("bill of sale sharing", () => {
  it("encodes agreement details only in the share URL fragment", () => {
    const url = createBillOfSaleShareUrl(validBill, "https://checkam.example/");
    const parsedUrl = new URL(url);

    expect(parsedUrl.pathname).toBe("/bill-of-sale");
    expect(parsedUrl.search).toBe("");
    expect(parsedUrl.hash).toContain(encodeURIComponent(validBill.sellerName));
    expect(readBillOfSaleShareHash(parsedUrl.hash)).toEqual(validBill);
  });

  it("rejects malformed and incomplete shared data", () => {
    expect(readBillOfSaleShareHash("#data=%7B")).toBeNull();
    expect(readBillOfSaleShareHash("#data=%7B%7D")).toBeNull();
  });
});

describe("bill of sale feature flag", () => {
  it("defaults off in every deployment environment", () => {
    expect(resolveBillOfSaleFlag(undefined)).toBe("false");
    expect(isBillOfSaleEnabled(undefined)).toBe(false);
  });

  it("enables only when the feature flag is explicitly true", () => {
    expect(resolveBillOfSaleFlag("false")).toBe("false");
    expect(resolveBillOfSaleFlag("true")).toBe("true");
    expect(isBillOfSaleEnabled("true")).toBe(true);
    expect(isBillOfSaleEnabled("false")).toBe(false);
    expect(isBillOfSaleEnabled("1")).toBe(false);
  });
});
