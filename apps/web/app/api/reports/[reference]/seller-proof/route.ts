import { randomBytes, randomUUID } from "node:crypto";
import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import {
  createSellerProofRequest,
  getPaymentByReference,
} from "@/lib/database";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";
import { hashSellerProofToken } from "@/lib/seller-proof";

const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  if (!arePaymentsEnabled() || !isSellerProofEnabled()) {
    return Response.json({ error: "Seller Proof is unavailable." }, { status: 404 });
  }

  try {
    const limited = await enforcePaymentRateLimit(request, {
      scope: "seller-proof-create",
      maxRequests: 5,
      windowSeconds: 60 * 60,
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

    const token = randomBytes(18).toString("base64url");
    const created = await createSellerProofRequest({
      id: randomUUID(),
      paymentReference: reference,
      tokenHash: hashSellerProofToken(token),
    });
    if (!created) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    return Response.json(
      { token },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to create Seller Proof request.", error);
    return Response.json(
      { error: "Unable to create a Seller Proof request." },
      { status: 500 },
    );
  }
}
