import { randomUUID } from "node:crypto";
import {
  accountSessionCookie,
  createAccountToken,
  hashAccountToken,
  hashPassword,
  isAccountRole,
  isValidAccountEmail,
  normalizeAccountEmail,
  validateAccountPhone,
} from "@/lib/accounts";
import {
  createAccount,
  createAccountSession,
  createEmailVerificationToken,
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
  if (!body) return accountError(400, "Enter a valid registration form.");

  const email =
    typeof body.email === "string" ? normalizeAccountEmail(body.email) : "";
  if (!isValidAccountEmail(email)) {
    return accountError(400, "Enter a valid email address.");
  }
  if (
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  ) {
    return accountError(400, "Password must be 12 to 128 characters.");
  }
  if (!isAccountRole(body.role)) {
    return accountError(400, "Choose a buyer or seller account.");
  }
  const phone = validateAccountPhone(body.phone);
  if (phone === undefined) {
    return accountError(400, "Enter a valid phone number or leave it blank.");
  }

  const rateLimitResponse = await accountRateLimitResponse({
    request,
    scope: "register",
    email,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const account = await createAccount({
      id: randomUUID(),
      email,
      passwordHash: await hashPassword(body.password),
      phone,
      role: body.role,
    });
    const sessionToken = createAccountToken();
    await createAccountSession({
      tokenHash: hashAccountToken(sessionToken),
      accountId: account.id,
      expiresAt: new Date(Date.now() + ACCOUNT_SESSION_DAYS * 24 * 60 * 60 * 1000),
    });

    if (process.env.NODE_ENV === "development") {
      const verificationToken = createAccountToken();
      await createEmailVerificationToken({
        tokenHash: hashAccountToken(verificationToken),
        accountId: account.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      console.info("Development email verification token:", verificationToken);
    }

    return accountSuccess(
      {
        account: {
          id: account.id,
          email: account.email,
          phone: account.phone,
          role: account.role,
          plan: account.plan,
          emailVerified: account.emailVerified,
        },
      },
      201,
      accountSessionCookie(sessionToken),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return accountError(409, "An account with this email already exists.");
    }
    console.error(
      "Account registration failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(500, "Unable to create the account. Please try again.");
  }
}
