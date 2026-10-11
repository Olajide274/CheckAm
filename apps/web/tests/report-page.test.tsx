import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "@/app/report/[reference]/page";
import { getPaymentByReference } from "@/lib/database";
import { modelLookup } from "@/lib/model-lookup";

vi.mock("@/lib/database", () => ({
  getPaymentByReference: vi.fn(),
}));

vi.mock("@/lib/model-lookup", () => ({
  modelLookup: { lookup: vi.fn() },
}));

describe("report page gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_PAYMENTS = "true";
    vi.mocked(modelLookup.lookup).mockResolvedValue({
      status: "not_found",
      brand: null,
      model: null,
    });
  });

  it("redirects for an unpaid payment", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44",
      amount: 50_000,
      status: "pending",
      createdAt: new Date(),
      tac: "49015420",
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });

    await expect(
      ReportPage({
        params: Promise.resolve({ reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44" }),
      }),
    ).rejects.toThrow();
  });

  it("redirects for a failed payment", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44",
      amount: 50_000,
      status: "failed",
      createdAt: new Date(),
      tac: "49015420",
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });

    await expect(
      ReportPage({
        params: Promise.resolve({ reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44" }),
      }),
    ).rejects.toThrow();
  });

  it("redirects for a made-up reference", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue(null);

    await expect(
      ReportPage({
        params: Promise.resolve({ reference: "made-up-reference" }),
      }),
    ).rejects.toThrow();
  });

  it("allows a successful payment to load the report", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44",
      amount: 50_000,
      status: "success",
      createdAt: new Date(),
      tac: "49015420",
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });

    const page = await ReportPage({
      params: Promise.resolve({ reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44" }),
    });

    expect(page.props.payment.reference).toBe(
      "2bb39cd6-fb82-4bf0-a00d-b744b4409f44",
    );
    expect(modelLookup.lookup).toHaveBeenCalledWith("49015420");
    expect(page.props.model).toEqual({
      status: "not_found",
      brand: null,
      model: null,
    });
  });
});
