import { arePaymentsEnabled } from "@/lib/features";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";
import { initializePayment, PaymentFlowError, getPaymentCallbackUrl } from "@/lib/payments";
import { getAccountForRequest } from "@/lib/accounts";
import { FREE_BUYER_FULL_REPORTS_PER_30_DAYS } from "@/lib/entitlements";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  if (!arePaymentsEnabled()) {
    return Response.json({ error: "Payments are unavailable." }, { status: 404 });
  }

  try {
    const limited = await enforcePaymentRateLimit(request, {
      scope: "initialize",
      maxRequests: 5,
      windowSeconds: 15 * 60,
    });
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!isRecord(body) || typeof body.email !== "string") {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }

    let imei: string | undefined;
    if (body.imei !== undefined && body.imei !== null && body.imei !== "") {
      if (typeof body.imei !== "string" || body.imei.length > 64) {
        return Response.json({ error: "Enter a valid IMEI." }, { status: 400 });
      }
      imei = body.imei;
    }

    const account = await getAccountForRequest(request);
    const result = await initializePayment({
      email: body.email,
      imei,
      callbackUrl: getPaymentCallbackUrl(request.url),
      ...(account
        ? {
            accountId: account.id,
            ...(account.role === "buyer" && account.plan === "free"
              ? { freeReportLimit: FREE_BUYER_FULL_REPORTS_PER_30_DAYS }
              : {}),
          }
        : {}),
    });

    return Response.json(
      {
        authorization_url: result.authorizationUrl,
        reference: result.reference,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PaymentFlowError) {
      return Response.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("Unable to initialize Paystack payment.", error);
    return Response.json(
      { error: "Unable to initialize payment." },
      { status: 500 },
    );
  }
}
