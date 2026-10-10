import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

describe("landing page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the format-only result after a valid IMEI is submitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    render(<Home />);

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
});
