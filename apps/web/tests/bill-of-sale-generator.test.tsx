import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillOfSaleGenerator from "@/components/bill-of-sale-generator";
import {
  createBillOfSaleShareUrl,
  type BillOfSaleData,
} from "@/lib/bill-of-sale";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const sharedAgreement: BillOfSaleData = {
  sellerName: "Ada Seller",
  sellerPhone: "+2348000000001",
  buyerName: "Bola Buyer",
  buyerPhone: "+2348000000002",
  deviceType: "Phone",
  brand: "Example",
  model: "Model 1",
  identifierType: "IMEI",
  identifier: "490154203237518",
  agreedPrice: "250000",
  date: "2026-10-10",
  conditionNotes: "Small mark on the case",
};

describe("bill of sale generator", () => {
  it("shows agreement details and the required disclaimer", () => {
    render(<BillOfSaleGenerator />);

    expect(screen.getByRole("heading", { name: "Bill of sale", level: 1 })).toBeDefined();
    expect(
      screen.getByText(
        "This document records an agreement between the parties. CheckAm is not a party to the sale and does not verify ownership.",
      ),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Print / save as PDF" }).hasAttribute("disabled")).toBe(true);
  });

  it("prints a complete agreement and shares a fragment-based URL", () => {
    const print = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("print", print);
    vi.stubGlobal("open", open);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<BillOfSaleGenerator />);

    const values: Record<string, string> = {
      "Seller name": "Ada Seller",
      "Seller phone number": "+2348000000001",
      "Buyer name": "Bola Buyer",
      "Buyer phone number": "+2348000000002",
      Brand: "Example",
      Model: "Model 1",
      "15-digit IMEI": "490154203237518",
      "Agreed price (naira)": "250000",
      Date: "2026-10-10",
    };

    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    fireEvent.click(screen.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Share on WhatsApp" }));
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/\?text=/),
      "_blank",
      "noopener,noreferrer",
    );
    expect(decodeURIComponent(open.mock.calls[0][0] as string)).toContain("#data=");
  });

  it("explains invalid share links instead of silently loading them", () => {
    window.history.replaceState(null, "", "/bill-of-sale#data=%7B");
    render(<BillOfSaleGenerator />);

    expect(screen.getByRole("alert").textContent).toBe(
      "This share link is invalid or incomplete.",
    );
  });

  it("loads shared agreement details from the URL fragment", () => {
    const shareUrl = createBillOfSaleShareUrl(sharedAgreement, window.location.origin);
    window.history.replaceState(null, "", `/bill-of-sale${new URL(shareUrl).hash}`);
    render(<BillOfSaleGenerator />);

    expect((screen.getByLabelText("Seller name") as HTMLInputElement).value).toBe("Ada Seller");
    expect((screen.getByLabelText("15-digit IMEI") as HTMLInputElement).value).toBe("490154203237518");
    expect((screen.getByLabelText("Condition notes") as HTMLTextAreaElement).value).toBe("Small mark on the case");
    expect(screen.getByText("Bola Buyer")).toBeDefined();
  });

  it("switches to serial number input without reverting the selected type", () => {
    render(<BillOfSaleGenerator />);

    fireEvent.click(screen.getByRole("radio", { name: "Serial number" }));

    const identifierInput = document.querySelector<HTMLInputElement>("#identifier");
    expect(identifierInput?.getAttribute("inputmode")).toBe("text");
    expect(document.querySelector('label[for="identifier"]')?.textContent).toBe(
      "Serial number",
    );
  });
});
