import { createHash } from "node:crypto";
import { consumePaymentRateLimit } from "@/lib/database";

export async function enforcePaymentRateLimit(
  request: Request,
  input: {
    scope: "initialize" | "status";
    maxRequests: number;
    windowSeconds: number;
  },
): Promise<Response | null> {
  const forwardedAddresses = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const clientAddress =
    forwardedAddresses?.at(-1) ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const clientHash = createHash("sha256")
    .update(clientAddress)
    .digest("hex");
  const allowed = await consumePaymentRateLimit({
    ...input,
    clientHash,
  });

  if (allowed) return null;

  return Response.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(input.windowSeconds),
      },
    },
  );
}
