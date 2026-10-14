import {
  enforceAccountClientRateLimit,
  enforceAccountRateLimits,
} from "@/lib/accounts";

export async function readAccountRequestBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 8_192) return null;

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8_192) return null;
    const body: unknown = JSON.parse(text);
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function accountRateLimitResponse(input: {
  request: Request;
  scope: "register" | "login";
  email: string;
}): Promise<Response | null> {
  try {
    const limited = await enforceAccountRateLimits(input);
    if (!limited) return null;
    return accountError(429, "Too many attempts. Please try again later.");
  } catch (error) {
    console.error(
      "Account rate limiting failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(503, "Account access is temporarily unavailable.");
  }
}

export async function accountClientRateLimitResponse(input: {
  request: Request;
  scope: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<Response | null> {
  try {
    const allowed = await enforceAccountClientRateLimit(input);
    return allowed
      ? null
      : accountError(429, "Too many attempts. Please try again later.");
  } catch (error) {
    console.error(
      "Account rate limiting failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return accountError(503, "Account access is temporarily unavailable.");
  }
}

export function accountError(
  status: number,
  error: string,
): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function accountSuccess(
  body: Record<string, unknown>,
  status = 200,
  cookie?: string,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}
