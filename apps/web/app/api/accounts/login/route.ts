import {
  accountSessionCookie,
  createAccountToken,
  hashAccountToken,
  hashPassword,
  isValidAccountEmail,
  normalizeAccountEmail,
  verifyPassword,
} from "@/lib/accounts";
import {
  createAccountSession,
  getAccountByEmail,
} from "@/lib/database";
import { ACCOUNT_SESSION_DAYS } from "@/lib/accounts";
import {
  accountError,
  accountRateLimitResponse,
  accountSuccess,
  readAccountRequestBody,
} from "@/lib/account-api";

export async function POST(request: Request): Promise<Response> {
  const body = await readAccountRequestBody(request);
  if (!body) return accountError(400, "Enter your email and password.");
  const email =
    typeof body.email === "string" ? normalizeAccountEmail(body.email) : "";
  if (
    !isValidAccountEmail(email) ||
    typeof body.password !== "string" ||
    body.password.length > 128
  ) {
    return accountError(400, "Enter a valid email address and password.");
  }

  const rateLimitResponse = await accountRateLimitResponse({
    request,
    scope: "login",
    email,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const account = await getAccountByEmail(email);
    const passwordMatches = account
      ? await verifyPassword(body.password, account.passwordHash)
      : await hashPassword(body.password).then(() => false);
    if (!account || !passwordMatches) {
      return accountError(401, "Email or password is incorrect.");
    }

    const sessionToken = createAccountToken();
    await createAccountSession({
      tokenHash: hashAccountToken(sessionToken),
      accountId: account.id,
      expiresAt: new Date(Date.now() + ACCOUNT_SESSION_DAYS * 24 * 60 * 60 * 1000),
    });
    return accountSuccess(
      {
        account: {
          id: account.id,
          email: account.email,
          fullName: account.fullName,
          username: account.username,
          phone: account.phone,
          role: account.role,
          plan: account.plan,
          emailVerified: account.emailVerified,
        },
      },
      200,
      accountSessionCookie(sessionToken),
    );
  } catch (error) {
    console.error(
      "Account login failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(500, "Unable to sign in. Please try again.");
  }
}
