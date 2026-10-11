import { connection } from "next/server";
import { arePaymentsEnabled } from "@/lib/features";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";
import { getPaymentStatus, PaymentFlowError } from "@/lib/payments";

export async function GET(request: Request) {
  await connection();
  if (!arePaymentsEnabled()) {
    return Response.json({ error: "Payments are unavailable." }, { status: 404 });
  }

  try {
    const limited = await enforcePaymentRateLimit(request, {
      scope: "status",
      maxRequests: 300,
      windowSeconds: 15 * 60,
    });
    if (limited) return limited;

    const reference = new URL(request.url).searchParams.get("reference");
    if (!reference) {
      return Response.json({ error: "A payment reference is required." }, { status: 400 });
    }

    const status = await getPaymentStatus(reference);
    if (!status) {
      return Response.json({ error: "Payment reference was not found." }, { status: 404 });
    }

    return Response.json(
      { status: status === "success" ? "paid" : status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PaymentFlowError) {
      return Response.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("Unable to get payment status.", error);
    return Response.json(
      { error: "Unable to get payment status." },
      { status: 500 },
    );
  }
}
