import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyticsPost } from "@/app/api/analytics/route";
import { POST as waitlistPost } from "@/app/api/waitlist/route";
import { recordAnalyticsEvent, saveWaitlistSignup } from "@/lib/database";

vi.mock("@/lib/database", () => ({
  recordAnalyticsEvent: vi.fn(),
  saveWaitlistSignup: vi.fn(),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an allowed event", async () => {
    const response = await analyticsPost(
      jsonRequest({ event: "full_report_click" }),
    );

    expect(response.status).toBe(200);
    expect(recordAnalyticsEvent).toHaveBeenCalledWith("full_report_click");
  });

  it("rejects unsupported events", async () => {
    const response = await analyticsPost(jsonRequest({ event: "payment" }));

    expect(response.status).toBe(400);
    expect(recordAnalyticsEvent).not.toHaveBeenCalled();
  });
});

describe("waitlist route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes email and saves the selected feature with an optional phone", async () => {
    const response = await waitlistPost(
      jsonRequest({
        email: "  BUYER@example.com ",
        phone: "+234 800 000 0000",
        feature: "Seller proof",
      }),
    );

    expect(response.status).toBe(201);
    expect(saveWaitlistSignup).toHaveBeenCalledWith({
      email: "buyer@example.com",
      phone: "+234 800 000 0000",
      feature: "Seller proof",
    });
  });

  it("rejects invalid email and unsupported feature values", async () => {
    const response = await waitlistPost(
      jsonRequest({ email: "bad-email", feature: "Payments" }),
    );

    expect(response.status).toBe(400);
    expect(saveWaitlistSignup).not.toHaveBeenCalled();
  });

  it("accepts an empty optional phone number", async () => {
    const response = await waitlistPost(
      jsonRequest({
        email: "buyer@example.com",
        phone: "",
        feature: "Model match",
      }),
    );

    expect(response.status).toBe(201);
    expect(saveWaitlistSignup).toHaveBeenCalledWith({
      email: "buyer@example.com",
      phone: null,
      feature: "Model match",
    });
  });
});
