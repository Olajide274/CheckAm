import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as initializePost } from "@/app/api/payments/initialize/route";
import { POST as webhookPost } from "@/app/api/payments/webhook/route";
import { GET as statusGet } from "@/app/api/payments/status/route";
import {
  consumePaymentRateLimit,
  createPendingPayment,
  getPaymentByReference,
  getAccountBySessionToken,
  markPaymentFailed,
  markPaymentSuccessful,
} from "@/lib/database";
import { arePaymentsEnabled } from "@/lib/features";

vi.mock("@/lib/database", () => ({
  consumePaymentRateLimit: vi.fn(),
  createPendingPayment: vi.fn(),
  getPaymentByReference: vi.fn(),
  getAccountBySessionToken: vi.fn(),
  markPaymentFailed: vi.fn(),
  markPaymentSuccessful: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

const secret = "sk_test_checkam_test_key";
const reference = "2bb39cd6-fb82-4bf0-a00d-b744b4409f44";
const originalEnvironment = {
  featurePayments: process.env.FEATURE_PAYMENTS,
  appEnvironment: process.env.APP_ENV,
  vercelEnvironment: process.env.VERCEL_ENV,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  imeiHashSecret: process.env.IMEI_HASH_SECRET,
  appBaseUrl: process.env.APP_BASE_URL,
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedWebhook(body: string): Request {
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers: { "x-paystack-signature": signature },
    body,
  });
}

describe("payment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.FEATURE_PAYMENTS = "true";
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    process.env.PAYSTACK_SECRET_KEY = secret;
    process.env.APP_BASE_URL = "http://localhost:3000";
    vi.mocked(consumePaymentRateLimit).mockResolvedValue(true);
    vi.mocked(getAccountBySessionToken).mockResolvedValue(null);
    vi.mocked(createPendingPayment).mockResolvedValue(true);
    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference,
      amount: 50_000,
      status: "pending",
      createdAt: new Date(),
      tac: null,
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });
    vi.mocked(markPaymentFailed).mockResolvedValue("failed");
    vi.mocked(markPaymentSuccessful).mockResolvedValue("success");
  });

  it("creates a pending payment with the fixed ₦500 Paystack amount", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const transaction = JSON.parse(String(init?.body)) as {
        amount: number;
        currency: string;
        reference: string;
        email: string;
      };
      return Response.json({
        status: true,
        data: {
          reference: transaction.reference,
          authorization_url: "https://checkout.paystack.com/access-code",
        },
      });
    });

    const response = await initializePost(
      jsonRequest("http://localhost/api/payments/initialize", {
        email: " BUYER@example.com ",
      }),
    );
    const result = (await response.json()) as {
      reference: string;
      authorization_url: string;
    };
    const transaction = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]?.[1]?.body),
    ) as { amount: number; currency: string; email: string };

    expect(response.status).toBe(201);
    expect(result.reference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.authorization_url).toBe(
      "https://checkout.paystack.com/access-code",
    );
    expect(createPendingPayment).toHaveBeenCalledWith({
      reference: result.reference,
      email: "buyer@example.com",
      imeiHash: null,
      tac: null,
      imeiLast4: null,
      imeiFormatValid: null,
      imeiLuhnValid: null,
    });
    expect(transaction.amount).toBe(50_000);
    expect(transaction.currency).toBe("NGN");
    expect(transaction.email).toBe("buyer@example.com");
    expect(vi.mocked(createPendingPayment).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("hashes an optional normalized IMEI instead of storing it", async () => {
    process.env.IMEI_HASH_SECRET = "h".repeat(32);
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const transaction = JSON.parse(String(init?.body)) as {
        reference: string;
      };
      return Response.json({
        status: true,
        data: {
          reference: transaction.reference,
          authorization_url: "https://checkout.paystack.com/access-code",
        },
      });
    });

    const response = await initializePost(
      jsonRequest("http://localhost/api/payments/initialize", {
        email: "buyer@example.com",
        imei: "490154203237518",
      }),
    );

    expect(response.status).toBe(201);
    expect(createPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        imeiHash: expect.stringMatching(/^[a-f\d]{64}$/),
        tac: "49015420",
        imeiLast4: "7518",
        imeiFormatValid: true,
        imeiLuhnValid: true,
      }),
    );
    expect(JSON.stringify(vi.mocked(createPendingPayment).mock.calls)).not.toContain(
      "490154203237518",
    );
  });

  it("rejects an invalid webhook signature without touching payment records", async () => {
    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "x-paystack-signature": "bad-signature" },
      body: JSON.stringify({ event: "charge.success" }),
    });

    const response = await webhookPost(request);

    expect(response.status).toBe(401);
    expect(getPaymentByReference).not.toHaveBeenCalled();
    expect(markPaymentSuccessful).not.toHaveBeenCalled();
  });

  it("marks a payment successful only after Paystack confirms the transaction", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference },
    });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "success",
        },
      }),
    );

    const response = await webhookPost(signedWebhook(body));

    expect(response.status).toBe(200);
    expect(markPaymentSuccessful).toHaveBeenCalledWith(reference);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.paystack.co/transaction/verify/${reference}`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${secret}` },
      }),
    );
  });

  it("returns paid from the status route after server-side Paystack verification", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "success",
        },
      }),
    );

    const response = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "paid" });
    expect(markPaymentSuccessful).toHaveBeenCalledWith(reference);
  });

  it("keeps abandoned or ongoing statuses pending until expiry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "abandoned",
        },
      }),
    );

    const response = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(markPaymentFailed).not.toHaveBeenCalled();
    expect(markPaymentSuccessful).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "ongoing",
        },
      }),
    );

    const ongoingResponse = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(ongoingResponse.status).toBe(200);
    expect(await ongoingResponse.json()).toEqual({ status: "pending" });
  });

  it("marks failed only for an explicit failed status or expiry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "failed",
        },
      }),
    );

    const failedResponse = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(failedResponse.status).toBe(200);
    expect(await failedResponse.json()).toEqual({ status: "failed" });
    expect(markPaymentFailed).toHaveBeenCalledWith(reference);

    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference,
      amount: 50_000,
      status: "pending",
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
      tac: "49015420",
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "pending",
        },
      }),
    );

    const expiredResponse = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(expiredResponse.status).toBe(200);
    expect(await expiredResponse.json()).toEqual({ status: "failed" });
  });

  it("keeps a successful payment from changing to another status", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue({
      reference,
      amount: 50_000,
      status: "success",
      createdAt: new Date(),
      tac: "49015420",
      imeiLast4: "7518",
      imeiFormatValid: true,
      imeiLuhnValid: true,
    });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "pending",
        },
      }),
    );

    const response = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "paid" });
    expect(markPaymentFailed).not.toHaveBeenCalled();
    expect(markPaymentSuccessful).not.toHaveBeenCalled();
  });

  it("rejects a transaction with an amount other than ₦500", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 100,
          currency: "NGN",
          status: "success",
        },
      }),
    );

    const response = await statusGet(
      new Request(
        `http://localhost/api/payments/status?reference=${reference}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "failed" });
    expect(markPaymentFailed).toHaveBeenCalledWith(reference);
    expect(markPaymentSuccessful).not.toHaveBeenCalled();
  });

  it("does not mark a payment successful when Paystack reports failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: true,
        data: {
          reference,
          amount: 50_000,
          currency: "NGN",
          status: "failed",
        },
      }),
    );
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference },
    });

    const response = await webhookPost(signedWebhook(body));

    expect(response.status).toBe(200);
    expect(markPaymentFailed).toHaveBeenCalledWith(reference);
    expect(markPaymentSuccessful).not.toHaveBeenCalled();
  });

  it("rate limits payment initialization", async () => {
    vi.mocked(consumePaymentRateLimit).mockResolvedValue(false);

    const response = await initializePost(
      jsonRequest("http://localhost/api/payments/initialize", {
        email: "buyer@example.com",
      }),
    );

    expect(response.status).toBe(429);
    expect(createPendingPayment).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the free buyer report limit on the server during checkout initialization", async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: "d9b81d00-b859-4df5-8374-5df9f6a354c6",
      email: "buyer@example.com",
      phone: null,
      role: "buyer",
      plan: "free",
      emailVerified: false,
      createdAt: new Date(),
    });
    vi.mocked(createPendingPayment).mockResolvedValue(false);

    const request = jsonRequest(
      "http://localhost/api/payments/initialize",
      { email: "buyer@example.com" },
    );
    request.headers.set(
      "Cookie",
      "checkam_account_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const response = await initializePost(request);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "The free full-report limit is used for this 30-day period.",
    });
    expect(createPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "d9b81d00-b859-4df5-8374-5df9f6a354c6",
        freeReportLimit: 1,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      key: "sk_live_checkam_live_key",
      appEnvironment: "production",
      vercelEnvironment: "preview",
    },
    {
      key: "sk_live_checkam_live_key",
      appEnvironment: "preview",
      vercelEnvironment: "production",
    },
    {
      key: "sk_test_checkam_test_key",
      appEnvironment: "production",
      vercelEnvironment: "preview",
    },
    {
      key: "sk_test_checkam_test_key",
      appEnvironment: "preview",
      vercelEnvironment: "production",
    },
  ])(
    "refuses unsafe Paystack key mode for $appEnvironment/$vercelEnvironment",
    async ({ key, appEnvironment, vercelEnvironment }) => {
      process.env.PAYSTACK_SECRET_KEY = key;
      process.env.APP_ENV = appEnvironment;
      process.env.VERCEL_ENV = vercelEnvironment;

      const response = await initializePost(
        jsonRequest("http://localhost/api/payments/initialize", {
          email: "buyer@example.com",
        }),
      );

      expect(response.status).toBe(503);
      expect(createPendingPayment).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toContain(key);
    },
  );

  it("allows live Paystack only when both environment markers are production", async () => {
    const liveSecret = "sk_live_checkam_live_key";
    process.env.PAYSTACK_SECRET_KEY = liveSecret;
    process.env.APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const transaction = JSON.parse(String(init?.body)) as {
        reference: string;
      };
      return Response.json({
        status: true,
        data: {
          reference: transaction.reference,
          authorization_url: "https://checkout.paystack.com/access-code",
        },
      });
    });

    const response = await initializePost(
      jsonRequest("http://localhost/api/payments/initialize", {
        email: "buyer@example.com",
      }),
    );

    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/initialize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(console.info).toHaveBeenCalledWith("Paystack payment mode: live.");
    expect(vi.mocked(console.info).mock.calls.flat().join(" ")).not.toContain(
      liveSecret,
    );
  });

  it("keeps payments off by default but allows explicit enablement in production", () => {
    delete process.env.FEATURE_PAYMENTS;
    expect(arePaymentsEnabled()).toBe(false);
    expect(arePaymentsEnabled("true")).toBe(true);
    expect(arePaymentsEnabled("")).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  const environmentKeys: Record<keyof typeof originalEnvironment, string> = {
    featurePayments: "FEATURE_PAYMENTS",
    appEnvironment: "APP_ENV",
    vercelEnvironment: "VERCEL_ENV",
    paystackSecretKey: "PAYSTACK_SECRET_KEY",
    imeiHashSecret: "IMEI_HASH_SECRET",
    appBaseUrl: "APP_BASE_URL",
  };
  for (const key of Object.keys(originalEnvironment) as Array<
    keyof typeof originalEnvironment
  >) {
    const value = originalEnvironment[key];
    const environmentKey = environmentKeys[key];
    if (value === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = value;
    }
  }
});
