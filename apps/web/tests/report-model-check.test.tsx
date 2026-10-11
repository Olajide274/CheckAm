import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("report model code check", () => {
  it("shows found data and compares the seller description", () => {
    render(
      <ReportPageContent
        model={{ status: "found", brand: "Acme", model: "Aster 1 Plus" }}
        payment={payment}
      />,
    );

    expect(screen.getByText("Model code check")).toBeTruthy();
    expect(screen.getByText("Aster 1 Plus")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "What does the seller say this phone is?",
      }),
      { target: { value: "ACME Aster-1 Plus" } },
    );
    expect(
      screen.getByText("Matches the seller's description"),
    ).toBeTruthy();
    expect(
      screen.getByText("Model data: Osmocom TAC database, CC-BY-SA 3.0"),
    ).toBeTruthy();
  });

  it("shows the message when no TAC entry exists", () => {
    render(
      <ReportPageContent
        model={{ status: "not_found", brand: null, model: null }}
        payment={payment}
      />,
    );

    expect(screen.getByText("Model not found in our database")).toBeTruthy();
  });
});
