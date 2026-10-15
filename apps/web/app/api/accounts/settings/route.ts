import {
  getAccountForRequest,
  hashPassword,
  normalizeAccountUsername,
  validateAccountFullName,
  validateAccountPhone,
  verifyPassword,
} from "@/lib/accounts";
import {
  accountClientRateLimitResponse,
  accountError,
  accountSuccess,
  readAccountRequestBody,
} from "@/lib/account-api";
import {
  getAccountByEmail,
  updateAccountSettings,
} from "@/lib/database";

export async function PATCH(request: Request): Promise<Response> {
  const rateLimitResponse = await accountClientRateLimitResponse({
    request,
    scope: "account-settings",
    maxRequests: 30,
    windowSeconds: 15 * 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readAccountRequestBody(request);
  if (!body) return accountError(400, "Enter valid account details.");

  const fullName = validateAccountFullName(body.fullName);
  if (!fullName) return accountError(400, "Enter your full name.");
  const username = normalizeAccountUsername(body.username);
  if (username === undefined) {
    return accountError(
      400,
      "Username must be 3 to 24 letters, numbers, or underscores.",
    );
  }
  const phone = validateAccountPhone(body.phone);
  if (phone === undefined) {
    return accountError(400, "Enter a valid phone number or leave it blank.");
  }

  let currentPassword: string | undefined;
  let newPassword: string | undefined;
  if (body.currentPassword !== undefined || body.newPassword !== undefined) {
    if (
      typeof body.currentPassword !== "string" ||
      body.currentPassword.length === 0 ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 12 ||
      body.newPassword.length > 128
    ) {
      return accountError(
        400,
        "Enter your current password and a new password of at least 12 characters.",
      );
    }
    currentPassword = body.currentPassword;
    newPassword = body.newPassword;
  }

  try {
    const account = await getAccountForRequest(request);
    if (!account) return accountError(401, "Sign in to update your account.");

    let passwordHash: string | undefined;
    if (currentPassword !== undefined && newPassword !== undefined) {
      const storedAccount = await getAccountByEmail(account.email);
      if (
        !storedAccount ||
        !(await verifyPassword(currentPassword, storedAccount.passwordHash))
      ) {
        return accountError(400, "Your current password is incorrect.");
      }
      passwordHash = await hashPassword(newPassword);
    }

    const updatedAccount = await updateAccountSettings({
      accountId: account.id,
      fullName,
      username,
      phone,
      ...(passwordHash ? { passwordHash } : {}),
    });
    return accountSuccess({
      account: {
        id: updatedAccount.id,
        email: updatedAccount.email,
        fullName: updatedAccount.fullName,
        username: updatedAccount.username,
        phone: updatedAccount.phone,
        role: updatedAccount.role,
        plan: updatedAccount.plan,
        emailVerified: updatedAccount.emailVerified,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return accountError(409, "That username is already taken.");
    }
    console.error(
      "Account settings update failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(500, "Unable to save your settings. Please try again.");
  }
}
