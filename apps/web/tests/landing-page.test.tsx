import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
const originalBillOfSaleFlag = process.env.FEATURE_BILL_OF_SALE;

describe("landing page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
    if (originalBillOfSaleFlag === undefined) {
      delete process.env.FEATURE_BILL_OF_SALE;
    } else {
      process.env.FEATURE_BILL_OF_SALE = originalBillOfSaleFlag;
    }
  });

  it("keeps a static accessible headline label", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) });
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Check a phone before you pay." }).getAttribute("aria-label"))
      .toBe("Check a phone before you pay.");
    expect(document.querySelector(".headline-device")?.getAttribute("aria-hidden"))
      .toBe("true");
  });

  it("keeps the phone headline when reduced motion is preferred", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) });
    render(<Home />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(document.querySelector(".headline-device-word")?.textContent).toBe("phone");
  });

  it("shows the format-only result after a valid IMEI is submitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    render(<Home />);

    expect(document.querySelector('a[href="/login"], a[href="/app"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Phone IMEI"), {
      target: { value: "490154203237518" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check IMEI" }));

    expect(
      await screen.findByText("IMEI looks valid – full report coming soon"),
    ).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/analytics",
      expect.objectContaining({
        body: JSON.stringify({ event: "imei_check_attempted" }),
      }),
    );
  });

  it("rejects a malformed IMEI without showing a report result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    render(<Home />);

    fireEvent.change(screen.getByLabelText("Phone IMEI"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check IMEI" }));

    expect(
      await screen.findByText("Enter a valid 15-digit IMEI and try again."),
    ).toBeDefined();
  });

  it("shows the bill of sale link only when the feature flag is enabled", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    process.env.FEATURE_BILL_OF_SALE = "true";
    render(<Home />);

    expect(screen.getByRole("link", { name: "Bill of sale" }).getAttribute("href")).toBe(
      "/bill-of-sale",
    );

    cleanup();
    process.env.FEATURE_BILL_OF_SALE = "false";
    render(<Home />);
    expect(screen.queryByRole("link", { name: "Bill of sale" })).toBeNull();
  });

  it("keeps the bill of sale link hidden when the feature flag is unset", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    delete process.env.FEATURE_BILL_OF_SALE;
    render(<Home />);

    expect(screen.queryByRole("link", { name: "Bill of sale" })).toBeNull();
  });
});
