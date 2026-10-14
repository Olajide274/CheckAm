import { hashAccountToken } from "@/lib/accounts";
import { verifyAccountEmail } from "@/lib/database";
import {
  accountClientRateLimitResponse,
  accountError,
  accountSuccess,
  readAccountRequestBody,
} from "@/lib/account-api";

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = await accountClientRateLimitResponse({
    request,
    scope: "account-email-verification",
    maxRequests: 10,
    windowSeconds: 60 * 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readAccountRequestBody(request);
  if (!body || typeof body.token !== "string" || body.token.length > 100) {
    return accountError(400, "Enter a valid verification token.");
  }
  try {
    const verified = await verifyAccountEmail(hashAccountToken(body.token));
    if (!verified) return accountError(400, "This verification token is invalid or expired.");
    return accountSuccess({ emailVerified: true });
  } catch (error) {
    console.error(
      "Email verification failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(500, "Unable to verify the email. Please try again.");
  }
}
