import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import { getPaymentByReference, getSellerProofFile } from "@/lib/database";

const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = referencePattern;

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ reference: string; proofId: string }> },
) {
  if (!arePaymentsEnabled() || !isSellerProofEnabled()) {
    return new Response(null, { status: 404 });
  }

  try {
    const { reference, proofId } = await params;
    if (!referencePattern.test(reference) || !idPattern.test(proofId)) {
      return new Response(null, { status: 404 });
    }

    const payment = await getPaymentByReference(reference);
    if (!payment || payment.status !== "success") {
      return new Response(null, { status: 404 });
    }

    const proof = await getSellerProofFile({
      paymentReference: reference,
      proofId,
    });
    if (!proof) return new Response(null, { status: 404 });

    return new Response(new Uint8Array(proof.data), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="seller-proof.${extensions[proof.mime]}"`,
        "Content-Length": String(proof.data.length),
        "Content-Type": proof.mime,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to retrieve Seller Proof attachment.", error);
    return Response.json(
      { error: "Unable to retrieve the proof attachment." },
      { status: 500 },
    );
  }
}
