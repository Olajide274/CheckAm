import { arePaymentsEnabled } from "@/lib/features";
import {
  hasValidPaystackSignature,
  PaymentFlowError,
  processPaystackWebhook,
} from "@/lib/payments";

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("Unable to read Paystack webhook body.", error);
    return Response.json({ error: "Unable to read webhook body." }, { status: 400 });
  }

  let hasValidSignature: boolean;
  try {
    hasValidSignature = hasValidPaystackSignature(
      rawBody,
      request.headers.get("x-paystack-signature"),
    );
  } catch (error) {
    if (error instanceof PaymentFlowError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Unable to check Paystack webhook signature.", error);
    return Response.json({ error: "Unable to check webhook signature." }, { status: 500 });
  }
  if (!hasValidSignature) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  if (!arePaymentsEnabled()) {
    return Response.json({ error: "Payments are unavailable." }, { status: 404 });
  }

  try {
    await processPaystackWebhook(rawBody);
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PaymentFlowError) {
      return Response.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("Unable to process Paystack webhook.", error);
    return Response.json(
      { error: "Unable to process webhook." },
      { status: 500 },
    );
  }
}
