import {
  createHmac,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { AccountProfile } from "@/lib/database";
import {
  consumeAccountRateLimit,
  getAccountBySessionToken,
} from "@/lib/database";
import type { Role } from "@/lib/entitlements";

export const ACCOUNT_SESSION_COOKIE = "checkam_account_session";
export const ACCOUNT_SESSION_DAYS = 30;
const PASSWORD_HASH_BYTES = 64;
const PASSWORD_SCRYPT_N = 16_384;
const PASSWORD_SCRYPT_R = 8;
const PASSWORD_SCRYPT_P = 1;

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      PASSWORD_HASH_BYTES,
      {
        N: PASSWORD_SCRYPT_N,
        r: PASSWORD_SCRYPT_R,
        p: PASSWORD_SCRYPT_P,
        maxmem: 32 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await derivePasswordHash(password, salt);
  return `scrypt$${PASSWORD_SCRYPT_N}$${PASSWORD_SCRYPT_R}$${PASSWORD_SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== String(PASSWORD_SCRYPT_N) ||
    parts[2] !== String(PASSWORD_SCRYPT_R) ||
    parts[3] !== String(PASSWORD_SCRYPT_P) ||
    !/^[a-f\d]{32}$/i.test(parts[4] ?? "") ||
    !/^[a-f\d]{128}$/i.test(parts[5] ?? "")
  ) {
    return false;
  }
  const expected = Buffer.from(parts[5]!, "hex");
  const actual = await derivePasswordHash(password, parts[4]!);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isValidAccountEmail(email: string): boolean {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAccountRole(value: unknown): value is Role {
  return value === "buyer" || value === "seller";
}

export function validateAccountPhone(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.trim().length > 32 ||
    !/^\+?[\d\s().-]{7,32}$/.test(value.trim()) ||
    value.replace(/\D/g, "").length < 7
  ) {
    return undefined;
  }
  return value.trim();
}

export function hashAccountToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAccountToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getAccountSessionToken(
  request: Request,
): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ACCOUNT_SESSION_COOKIE}=`));
  const token = pair?.slice(ACCOUNT_SESSION_COOKIE.length + 1);
  return token && /^[\w-]{40,60}$/.test(token) ? token : null;
}

export async function getAccountForRequest(
  request: Request,
): Promise<AccountProfile | null> {
  const token = getAccountSessionToken(request);
  return token ? getAccountBySessionToken(hashAccountToken(token)) : null;
}

export async function getAccountForToken(
  token: string | undefined,
): Promise<AccountProfile | null> {
  return token ? getAccountBySessionToken(hashAccountToken(token)) : null;
}

export function accountSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCOUNT_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCOUNT_SESSION_DAYS * 24 * 60 * 60}${secure}`;
}

export function expiredAccountSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCOUNT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function hashRateLimitIdentity(identity: string): string {
  const secret = process.env.ACCOUNT_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ACCOUNT_RATE_LIMIT_SECRET must contain at least 32 characters.",
      );
    }
    return createHash("sha256")
      .update(`checkam-development-rate-limit:${identity}`)
      .digest("hex");
  }
  return createHmac("sha256", secret).update(identity).digest("hex");
}

export async function enforceAccountRateLimits(input: {
  request: Request;
  scope: "register" | "login";
  email: string;
}): Promise<boolean> {
  const forwardedFor = input.request.headers.get("x-forwarded-for");
  const clientAddress =
    input.request.headers.get("x-real-ip") ??
    forwardedFor?.split(",")[0]?.trim() ??
    "unknown";
  const [clientAllowed, emailAllowed] = await Promise.all([
    consumeAccountRateLimit({
      scope: `${input.scope}:client`,
      identifierHash: hashRateLimitIdentity(clientAddress),
      maxRequests: input.scope === "register" ? 10 : 20,
      windowSeconds: input.scope === "register" ? 60 * 60 : 15 * 60,
    }),
    consumeAccountRateLimit({
      scope: `${input.scope}:email`,
      identifierHash: hashRateLimitIdentity(input.email),
      maxRequests: input.scope === "register" ? 5 : 10,
      windowSeconds: input.scope === "register" ? 60 * 60 : 15 * 60,
    }),
  ]);
  return !clientAllowed || !emailAllowed;
}

export async function enforceAccountClientRateLimit(input: {
  request: Request;
  scope: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<boolean> {
  const forwardedFor = input.request.headers.get("x-forwarded-for");
  const clientAddress = (
    input.request.headers.get("x-real-ip") ??
    forwardedFor?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 128);
  return consumeAccountRateLimit({
    scope: input.scope,
    identifierHash: hashRateLimitIdentity(clientAddress),
    maxRequests: input.maxRequests,
    windowSeconds: input.windowSeconds,
  });
}
