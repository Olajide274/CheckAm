import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as authProxyPost } from "@/app/api/auth/[...segments]/route";
import { POST as registerPost } from "@/app/api/accounts/register/route";
import { POST as loginPost } from "@/app/api/accounts/login/route";
import { LoginForm } from "@/components/login-form";
import { hashPassword } from "@/lib/accounts";
import PricingPage from "@/app/pricing/page";

const database = vi.hoisted(() => ({
  consumeAccountRateLimit: vi.fn(),
  createAccount: vi.fn(),
  createAccountSession: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  getAccountByEmail: vi.fn(),
  getAccountBySessionToken: vi.fn(),
  deleteAccountSession: vi.fn(),
  verifyAccountEmail: vi.fn(),
}));

const { router } = vi.hoisted(() => ({
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("@/lib/database", () => database);

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/components/account-header", () => ({
  AccountHeader: () => null,
}));

const account = {
  id: "d9b81d00-b859-4df5-8374-5df9f6a354c6",
  email: "buyer@example.com",
  phone: null,
  role: "buyer" as const,
  plan: "free" as const,
  emailVerified: false,
  createdAt: new Date("2026-10-14T00:00:00Z"),
};

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("email-first accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    router.replace.mockReset();
    router.refresh.mockReset();
    database.consumeAccountRateLimit.mockResolvedValue(true);
    database.createAccount.mockImplementation(async (input) => ({
      ...account,
      email: input.email,
      phone: input.phone,
      role: input.role,
    }));
    database.createAccountSession.mockResolvedValue(undefined);
    database.createEmailVerificationToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("registers a normalized email, required role, optional phone, and scrypt password", async () => {
    const response = await registerPost(
      jsonRequest("/api/accounts/register", {
        email: " Buyer@Example.com ",
        password: "a-long-password-with-12+",
        phone: "+234 801 234 5678",
        role: "buyer",
      }),
    );
    const result = (await response.json()) as {
      account: { email: string; role: string; plan: string; emailVerified: boolean };
    };
    const createInput = database.createAccount.mock.calls[0]?.[0] as {
      email: string;
      passwordHash: string;
      phone: string;
      role: string;
    };

    expect(response.status).toBe(201);
    expect(result.account).toEqual({
      id: account.id,
      email: "buyer@example.com",
      phone: "+234 801 234 5678",
      role: "buyer",
      plan: "free",
      emailVerified: false,
    });
    expect(createInput.email).toBe("buyer@example.com");
    expect(createInput.role).toBe("buyer");
    expect(createInput.passwordHash).not.toBe("a-long-password-with-12+");
    expect(createInput.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(database.createAccountSession).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account.id }),
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("rejects an invalid email, missing role, and short password", async () => {
    for (const body of [
      { email: "not-an-email", password: "a-long-password-with-12+", role: "buyer" },
      { email: "buyer@example.com", password: "a-long-password-with-12+" },
      { email: "buyer@example.com", password: "short", role: "seller" },
    ]) {
      const response = await registerPost(
        jsonRequest("/api/accounts/register", body),
      );
      expect(response.status).toBe(400);
    }
    expect(database.createAccount).not.toHaveBeenCalled();
  });

  it("logs in with the stored password hash and gives a new session cookie", async () => {
    const password = "correct-horse-battery-staple";
    database.getAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash: await hashPassword(password),
    });

    const response = await loginPost(
      jsonRequest("/api/accounts/login", {
        email: "BUYER@example.com",
        password,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      account: { email: "buyer@example.com", role: "buyer", plan: "free" },
    });
    expect(database.getAccountByEmail).toHaveBeenCalledWith("buyer@example.com");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rate limits registration before storing an account", async () => {
    database.consumeAccountRateLimit.mockResolvedValue(false);

    const response = await registerPost(
      jsonRequest("/api/accounts/register", {
        email: "buyer@example.com",
        password: "a-long-password-with-12+",
        role: "seller",
      }),
    );

    expect(response.status).toBe(429);
    expect(database.createAccount).not.toHaveBeenCalled();
  });

  it("posts registration details from the form and navigates to the dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ account }), { status: 201 }),
      ),
    );
    render(<LoginForm mode="register" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "seller@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-password-with-12+" },
    });
    fireEvent.change(screen.getByLabelText("I am joining as a"), {
      target: { value: "seller" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/accounts/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "seller@example.com",
          password: "a-long-password-with-12+",
          phone: "",
          role: "seller",
        }),
      }),
    );
  });

  it("renders separate buyer and seller pricing with premium billing unavailable", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { name: "For buyers" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "For sellers" })).toBeTruthy();
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    const pricingText = document.body.textContent ?? "";
    expect(pricingText).toContain(
      "Up to 1 full report unlock per rolling 30 days",
    );
    expect(pricingText).toContain(
      "Up to 2 bill of sale actions per rolling 30 days",
    );
  });
});

describe("legacy phone auth proxy", () => {
  const originalApiUrl = process.env.CHECKAM_API_URL;

  beforeEach(() => {
    process.env.CHECKAM_API_URL = "http://localhost:5000";
  });

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.CHECKAM_API_URL;
    } else {
      process.env.CHECKAM_API_URL = originalApiUrl;
    }
    vi.unstubAllGlobals();
  });

  it("continues to forward the existing API session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "checkam_session=token; Path=/; HttpOnly; SameSite=Lax",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost/api/auth/session", {
      headers: { Cookie: "checkam_session=existing-token" },
    });

    const response = await authProxyPost(request, {
      params: Promise.resolve({ segments: ["session"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/auth/session",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "checkam_session=existing-token",
        }),
      }),
    );
  });
});
