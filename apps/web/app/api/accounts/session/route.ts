import { getAccountForRequest } from "@/lib/accounts";
import {
  accountClientRateLimitResponse,
  accountSuccess,
} from "@/lib/account-api";

export async function GET(request: Request): Promise<Response> {
  const rateLimitResponse = await accountClientRateLimitResponse({
    request,
    scope: "account-session",
    maxRequests: 120,
    windowSeconds: 15 * 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const account = await getAccountForRequest(request);
    return accountSuccess(
      account
        ? {
            authenticated: true,
            account: {
              id: account.id,
              email: account.email,
              phone: account.phone,
              role: account.role,
              plan: account.plan,
              emailVerified: account.emailVerified,
            },
          }
        : { authenticated: false },
    );
  } catch (error) {
    console.error(
      "Account session lookup failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      { error: "Unable to check your account session." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
