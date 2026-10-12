import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";
import {
  hasSupportedImageSignature,
  hashSellerProofToken,
  isSellerProofToken,
} from "@/lib/seller-proof";
import { SELLER_PROOF_MAX_FILE_SIZE } from "@/lib/seller-proof-constants";
import { submitSellerProof } from "@/lib/database";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!arePaymentsEnabled() || !isSellerProofEnabled()) {
    return Response.json({ error: "Seller Proof is unavailable." }, { status: 404 });
  }

  try {
    const limited = await enforcePaymentRateLimit(request, {
      scope: "seller-proof-submit",
      maxRequests: 10,
      windowSeconds: 15 * 60,
    });
    if (limited) return limited;

    const { token } = await params;
    if (!isSellerProofToken(token)) {
      return Response.json({ error: "This request link is invalid or already used." }, { status: 404 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > SELLER_PROOF_MAX_FILE_SIZE + 64 * 1024) {
      return Response.json({ error: "The photo must be 4 MB or smaller." }, { status: 413 });
    }

    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      return Response.json({ error: "Upload a photo of the receipt or device." }, { status: 400 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "The upload could not be read." }, { status: 400 });
    }

    const file = form.get("proof");
    if (file === null || typeof file === "string" || file.size === 0) {
      return Response.json({ error: "Choose a photo of the receipt or device." }, { status: 400 });
    }
    if (file.size > SELLER_PROOF_MAX_FILE_SIZE) {
      return Response.json({ error: "The photo must be 4 MB or smaller." }, { status: 413 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const proofMime = file.type;
    if (!hasSupportedImageSignature(proofMime, data)) {
      return Response.json(
        { error: "Use a JPEG, PNG, or WebP photo." },
        { status: 400 },
      );
    }

    const phoneValue = form.get("phone");
    if (phoneValue !== null && typeof phoneValue !== "string") {
      return Response.json({ error: "Enter a valid phone number." }, { status: 400 });
    }
    const phone = typeof phoneValue === "string" ? phoneValue.trim() : "";
    if (phone.length > 32 || (phone && !/^\+?[\d ()-]{7,24}$/.test(phone))) {
      return Response.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const saved = await submitSellerProof({
      tokenHash: hashSellerProofToken(token),
      proofMime,
      proofData: data,
      sellerPhone: phone || null,
    });
    if (!saved) {
      return Response.json(
        { error: "This request link is invalid or already used." },
        { status: 404 },
      );
    }

    return Response.json(
      { received: true },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to save Seller Proof response.", error);
    return Response.json(
      { error: "Unable to save this response. Please try again." },
      { status: 500 },
    );
  }
}
