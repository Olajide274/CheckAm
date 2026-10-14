import {
  expiredAccountSessionCookie,
  getAccountSessionToken,
  hashAccountToken,
} from "@/lib/accounts";
import { deleteAccountSession } from "@/lib/database";
import {
  accountClientRateLimitResponse,
  accountSuccess,
} from "@/lib/account-api";

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = await accountClientRateLimitResponse({
    request,
    scope: "account-logout",
    maxRequests: 30,
    windowSeconds: 15 * 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const token = getAccountSessionToken(request);
    if (token) await deleteAccountSession(hashAccountToken(token));
    return accountSuccess({ loggedOut: true }, 200, expiredAccountSessionCookie());
  } catch (error) {
    console.error(
      "Account logout failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      { error: "Unable to sign out. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
