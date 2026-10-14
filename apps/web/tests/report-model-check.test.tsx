import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportPageContent from "@/components/report-page";
import type { PaymentRecord } from "@/lib/database";

const payment: PaymentRecord = {
  reference: "2bb39cd6-fb82-4bf0-a00d-b744b4409f44",
  amount: 50_000,
  status: "success",
  createdAt: new Date(),
  tac: "12345678",
  imeiLast4: "7518",
  imeiFormatValid: true,
  imeiLuhnValid: true,
};

const originalSellerProofFlag = process.env.FEATURE_SELLER_PROOF;
const originalBillOfSaleFlag = process.env.FEATURE_BILL_OF_SALE;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

afterEach(() => {
  if (originalSellerProofFlag === undefined) {
    delete process.env.FEATURE_SELLER_PROOF;
  } else {
    process.env.FEATURE_SELLER_PROOF = originalSellerProofFlag;
  }
  if (originalBillOfSaleFlag === undefined) {
    delete process.env.FEATURE_BILL_OF_SALE;
  } else {
    process.env.FEATURE_BILL_OF_SALE = originalBillOfSaleFlag;
  }
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  vi.unstubAllGlobals();
});

describe("report model code check", () => {
  it("shows found data and compares the seller description", () => {
    process.env.FEATURE_BILL_OF_SALE = "true";
    render(
      <ReportPageContent
        model={{ status: "found", brand: "Acme", model: "Aster 1 Plus" }}
        payment={payment}
        sellerProof={{
          requested: false,
          respondedAt: null,
          proofId: null,
          proofMime: null,
        }}
      />,
    );

    expect(screen.getByText("Model match")).toBeTruthy();
    expect(screen.getByText("Aster 1 Plus")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Generate a Bill of Sale" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This result is based on information reported by users. It is not proof of ownership, legality or safety.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Model data: Osmocom TAC database (CC-BY-SA 3.0) and a supplementary community TAC list. Model codes can be wrong or out of date.",
      ),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "What does the seller say this phone is?",
      }),
      { target: { value: "ACME Aster-1 Plus" } },
    );
    expect(
      screen.getByText("Matches the seller's description"),
    ).toBeTruthy();
  });

  it("shows the message when no TAC entry exists", () => {
    render(
      <ReportPageContent
        model={{ status: "not_found", brand: null, model: null }}
        payment={payment}
        sellerProof={{
          requested: false,
          respondedAt: null,
          proofId: null,
          proofMime: null,
        }}
      />,
    );

    expect(
      screen.getByText(
        "No model match is available for this TAC in our database.",
      ),
    ).toBeTruthy();
  });

  it("shows brand-only TAC data without implying a model match", () => {
    render(
      <ReportPageContent
        model={{ status: "brand_only", brand: "ITEL" }}
        payment={payment}
        sellerProof={{
          requested: false,
          respondedAt: null,
          proofId: null,
          proofMime: null,
        }}
      />,
    );

    expect(
      screen.getByText("Brand: ITEL. The model is not specified in our data."),
    ).toBeTruthy();
  });

  it("shows a Seller Proof response timestamp and photo link", () => {
    process.env.FEATURE_SELLER_PROOF = "true";
    render(
      <ReportPageContent
        model={{ status: "not_found", brand: null, model: null }}
        payment={payment}
        sellerProof={{
          requested: true,
          respondedAt: new Date("2026-10-12T12:00:00.000Z"),
          proofId: "2bb39cd6-fb82-4bf0-a00d-b744b4409f45",
          proofMime: "image/jpeg",
        }}
      />,
    );

    expect(screen.getByText(/Seller responded on/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Download seller-submitted photo" }),
    ).toBeTruthy();
  });

  it("creates a request link and offers copy and WhatsApp sharing", async () => {
    process.env.FEATURE_SELLER_PROOF = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "POST"
            ? Response.json(
                { token: "abcdefghijklmnopqrstuvwx" },
                { status: 201 },
              )
            : Response.json(
                { requested: true, respondedAt: null, proofUrl: null },
              ),
        ),
      ),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <ReportPageContent
        model={{ status: "not_found", brand: null, model: null }}
        payment={payment}
        sellerProof={{
          requested: false,
          respondedAt: null,
          proofId: null,
          proofMime: null,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Create Seller Proof request link" }),
    );

    const link = await screen.findByLabelText("Request link");
    if (!(link instanceof HTMLInputElement)) {
      throw new Error("The Seller Proof URL should be shown in an input.");
    }
    expect(link.value).toBe(
      `${window.location.origin}/seller-proof/abcdefghijklmnopqrstuvwx`,
    );
    const whatsappLink = screen.getByRole("link", { name: "Share via WhatsApp" });
    expect(whatsappLink.getAttribute("href")).toContain("https://wa.me/?text=");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/seller-proof/abcdefghijklmnopqrstuvwx`,
      );
    });
  });
});
