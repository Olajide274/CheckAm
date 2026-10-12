import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import { getPaymentByReference, getSellerProofStatus } from "@/lib/database";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";

const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  if (!arePaymentsEnabled() || !isSellerProofEnabled()) {
    return Response.json({ error: "Seller Proof is unavailable." }, { status: 404 });
  }

  try {
    const limited = await enforcePaymentRateLimit(request, {
      scope: "seller-proof-status",
      maxRequests: 60,
      windowSeconds: 15 * 60,
    });
    if (limited) return limited;

    const { reference } = await params;
    if (!referencePattern.test(reference)) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    const payment = await getPaymentByReference(reference);
    if (!payment || payment.status !== "success") {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    const status = await getSellerProofStatus(reference);
    return Response.json(
      {
        requested: status.requested,
        respondedAt: status.respondedAt?.toISOString() ?? null,
        proofUrl: status.proofId
          ? `/api/reports/${encodeURIComponent(reference)}/seller-proof/${encodeURIComponent(status.proofId)}`
          : null,
        sellerPhone: status.sellerPhone,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to get Seller Proof status.", error);
    return Response.json(
      { error: "Unable to get Seller Proof status." },
      { status: 500 },
    );
  }
}
