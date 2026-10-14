import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createPendingPayment,
  getPaymentByReference,
  markPaymentFailed,
  markPaymentSuccessful,
  type PaymentStatus,
} from "@/lib/database";
import {
  PAYMENT_AMOUNT_KOBO,
  PAYMENT_CURRENCY,
  PAYMENT_EXPIRY_MINUTES,
} from "@/lib/payment-constants";
import { normalizeImei } from "@/lib/imei";

const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PaymentFlowError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "PaymentFlowError";
  }
}

function getPaystackSecretKey(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const isProduction =
    process.env.APP_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  if (secret?.startsWith("sk_live_")) {
    if (
      process.env.APP_ENV !== "production" ||
      process.env.VERCEL_ENV !== "production"
    ) {
      throw new PaymentFlowError(
        "Live Paystack credentials require both environments to be production.",
        503,
      );
    }
    console.info("Paystack payment mode: live.");
    return secret;
  }

  if (secret?.startsWith("sk_test_") && !isProduction) {
    console.info("Paystack payment mode: test.");
    return secret;
  }

  if (secret?.startsWith("sk_test_")) {
    throw new PaymentFlowError(
      "Paystack test credentials cannot be used in production.",
      503,
    );
  }

  throw new PaymentFlowError("Paystack credentials are not configured.", 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function getPaymentCallbackUrl(requestUrl: string): string {
  let baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined);

  if (
    !baseUrl &&
    (process.env.APP_ENV === "production" ||
      process.env.VERCEL_ENV === "production")
  ) {
    throw new PaymentFlowError(
      "The payment return URL is not configured.",
      503,
    );
  }

  if (!baseUrl) {
    const requestOrigin = new URL(requestUrl);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(requestOrigin.hostname)
    ) {
      throw new PaymentFlowError(
        "The payment return URL is not configured.",
        503,
      );
    }
    baseUrl = requestOrigin.origin;
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL("/", baseUrl);
  } catch {
    throw new PaymentFlowError(
      "The payment return URL is not configured.",
      503,
    );
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(
    callbackUrl.hostname,
  );
  if (
    (callbackUrl.protocol !== "https:" &&
      !(callbackUrl.protocol === "http:" && isLocal)) ||
    callbackUrl.username ||
    callbackUrl.password
  ) {
    throw new PaymentFlowError(
      "The payment return URL is not configured.",
      503,
    );
  }

  callbackUrl.searchParams.set("payment", "return");
  return callbackUrl.toString();
}

function getImeiHash(imei: string): {
  hash: string;
  tac: string;
  last4: string;
  formatValid: boolean;
  luhnValid: boolean;
} {
  const normalized = normalizeImei(imei);
  if (!normalized) {
    throw new PaymentFlowError("Enter a valid IMEI or leave it blank.", 400);
  }

  const hashSecret = process.env.IMEI_HASH_SECRET;
  if (!hashSecret || hashSecret.length < 32) {
    throw new PaymentFlowError(
      "IMEI hashing is not configured.",
      503,
    );
  }

  const formatValid = /^\d{15}$/.test(imei.replace(/[\s-]/g, ""));

  return {
    hash: createHmac("sha256", hashSecret).update(normalized).digest("hex"),
    tac: normalized.slice(0, 8),
    last4: normalized.slice(-4),
    formatValid,
    luhnValid: true,
  };
}

export async function initializePayment(input: {
  email: string;
  imei?: string;
  callbackUrl: string;
  accountId?: string;
  freeReportLimit?: number;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const secret = getPaystackSecretKey();
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new PaymentFlowError("Enter a valid email address.", 400);
  }

  const imei = input.imei ? getImeiHash(input.imei) : null;
  const reference = randomUUID();

  const pendingPaymentCreated = await createPendingPayment({
    reference,
    email,
    ...(input.accountId
      ? {
          accountId: input.accountId,
          ...(input.freeReportLimit !== undefined
            ? { freeReportLimit: input.freeReportLimit }
            : {}),
        }
      : {}),
    imeiHash: imei?.hash ?? null,
    tac: imei?.tac ?? null,
    imeiLast4: imei?.last4 ?? null,
    imeiFormatValid: imei?.formatValid ?? null,
    imeiLuhnValid: imei?.luhnValid ?? null,
  });
  if (pendingPaymentCreated === false) {
    throw new PaymentFlowError(
      "The free full-report limit is used for this 30-day period.",
      429,
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: PAYMENT_AMOUNT_KOBO,
        currency: PAYMENT_CURRENCY,
        reference,
        callback_url: input.callbackUrl,
      }),
      cache: "no-store",
    });
  } catch {
    await markPaymentFailed(reference);
    throw new PaymentFlowError("Unable to start payment with Paystack.", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    await markPaymentFailed(reference);
    throw new PaymentFlowError("Paystack returned an invalid response.", 502);
  }

  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  const authorizationUrl =
    data && typeof data.authorization_url === "string"
      ? data.authorization_url
      : null;
  let parsedAuthorizationUrl: URL | null = null;
  if (authorizationUrl) {
    try {
      parsedAuthorizationUrl = new URL(authorizationUrl);
    } catch {
      parsedAuthorizationUrl = null;
    }
  }

  if (
    !response.ok ||
    !isRecord(payload) ||
    payload.status !== true ||
    !data ||
    data.reference !== reference ||
    !parsedAuthorizationUrl ||
    parsedAuthorizationUrl.protocol !== "https:" ||
    parsedAuthorizationUrl.hostname !== "checkout.paystack.com"
  ) {
    await markPaymentFailed(reference);
    throw new PaymentFlowError("Paystack could not start this payment.", 502);
  }

  return {
    authorizationUrl: parsedAuthorizationUrl.toString(),
    reference,
  };
}

type PaystackTransactionStatus =
  | "success"
  | "pending"
  | "failed"
  | "abandoned"
  | "ongoing";

async function getPaystackTransactionStatus(
  reference: string,
): Promise<PaystackTransactionStatus> {
  const secret = getPaystackSecretKey();
  let response: Response;
  try {
    response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      },
    );
  } catch {
    throw new PaymentFlowError(
      "Unable to check payment with Paystack. Please try again.",
      502,
    );
  }

  if (response.status === 429 || response.status >= 500) {
    throw new PaymentFlowError(
      "Unable to check payment with Paystack. Please try again.",
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) return "failed";
    throw new PaymentFlowError("Paystack returned an invalid response.", 502);
  }

  if (!response.ok || !isRecord(payload) || payload.status !== true) {
    return "failed";
  }

  const data = isRecord(payload.data) ? payload.data : null;
  if (!data || data.reference !== reference) {
    return "failed";
  }

  if (data.status === "success") {
    return data.amount === PAYMENT_AMOUNT_KOBO && data.currency === PAYMENT_CURRENCY
      ? "success"
      : "failed";
  }

  if (data.status === "pending" || data.status === "abandoned" || data.status === "ongoing") {
    return "pending";
  }

  return "failed";
}

export function hasValidPaystackSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", getPaystackSecretKey())
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

function readWebhookEvent(rawBody: string): {
  event: string;
  reference: string;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new PaymentFlowError("Invalid webhook body.", 400);
  }

  if (
    !isRecord(payload) ||
    typeof payload.event !== "string" ||
    !isRecord(payload.data) ||
    typeof payload.data.reference !== "string" ||
    !referencePattern.test(payload.data.reference)
  ) {
    throw new PaymentFlowError("Invalid webhook body.", 400);
  }

  return { event: payload.event, reference: payload.data.reference };
}

export async function processPaystackWebhook(
  rawBody: string,
): Promise<void> {
  const { event, reference } = readWebhookEvent(rawBody);
  if (event !== "charge.success" && event !== "charge.failed") return;

  const payment = await getPaymentByReference(reference);
  if (!payment) {
    throw new PaymentFlowError("Payment reference was not found.", 404);
  }
  if (payment.status !== "pending") return;

  if (
    payment.amount !== PAYMENT_AMOUNT_KOBO ||
    Date.now() - payment.createdAt.getTime() >
      PAYMENT_EXPIRY_MINUTES * 60 * 1000
  ) {
    await markPaymentFailed(reference);
    return;
  }

  if (event === "charge.failed") {
    await markPaymentFailed(reference);
    return;
  }

  const status = await getPaystackTransactionStatus(reference);
  if (status === "success") {
    await markPaymentSuccessful(reference);
  } else if (status === "failed") {
    await markPaymentFailed(reference);
  }
}

export async function getPaymentStatus(
  reference: string,
): Promise<PaymentStatus | null> {
  if (!referencePattern.test(reference)) {
    throw new PaymentFlowError("Invalid payment reference.", 400);
  }

  const payment = await getPaymentByReference(reference);
  if (!payment) return null;
  if (payment.status !== "pending") return payment.status;

  if (
    payment.amount !== PAYMENT_AMOUNT_KOBO ||
    Date.now() - payment.createdAt.getTime() >
      PAYMENT_EXPIRY_MINUTES * 60 * 1000
  ) {
    return markPaymentFailed(reference);
  }

  const status = await getPaystackTransactionStatus(reference);
  if (status === "success") return markPaymentSuccessful(reference);
  if (status === "failed") return markPaymentFailed(reference);
  return "pending";
}
