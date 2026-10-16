import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as authProxyPost } from "@/app/api/auth/[...segments]/route";
import { POST as registerPost } from "@/app/api/accounts/register/route";
import { POST as loginPost } from "@/app/api/accounts/login/route";
import { PATCH as settingsPatch } from "@/app/api/accounts/settings/route";
import { AccountNavigation } from "@/components/account-navigation";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { LoginForm } from "@/components/login-form";
import { hashPassword } from "@/lib/accounts";
import PricingPage from "@/app/pricing/page";
import { shouldShowEmailVerificationNotice } from "@/lib/features";

const database = vi.hoisted(() => ({
  consumeAccountRateLimit: vi.fn(),
  createAccount: vi.fn(),
  createAccountSession: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  getAccountByEmail: vi.fn(),
  getAccountBySessionToken: vi.fn(),
  updateAccountSettings: vi.fn(),
  deleteAccountSession: vi.fn(),
  verifyAccountEmail: vi.fn(),
}));

const { router } = vi.hoisted(() => ({
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
    pathname: "/dashboard",
  },
}));

vi.mock("@/lib/database", () => database);

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => router.pathname,
}));

vi.mock("@/components/account-header", () => ({
  AccountHeader: () => null,
}));

const account = {
  id: "d9b81d00-b859-4df5-8374-5df9f6a354c6",
  email: "buyer@example.com",
  fullName: "Buyer Example",
  username: "buyer_example",
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
    router.pathname = "/dashboard";
    database.consumeAccountRateLimit.mockResolvedValue(true);
    database.createAccount.mockImplementation(async (input) => ({
      ...account,
      email: input.email,
      fullName: input.fullName,
      username: input.username,
      phone: input.phone,
      role: input.role,
    }));
    database.updateAccountSettings.mockImplementation(async (input) => ({
      ...account,
      ...input,
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
        fullName: "Buyer Example",
        username: "@buyer_example",
        phone: "+234 801 234 5678",
        role: "buyer",
      }),
    );
    const result = (await response.json()) as {
      account: {
        email: string;
        fullName: string;
        username: string;
        role: string;
        plan: string;
        emailVerified: boolean;
      };
    };
    const createInput = database.createAccount.mock.calls[0]?.[0] as {
      email: string;
      passwordHash: string;
      fullName: string;
      username: string;
      phone: string;
      role: string;
    };

    expect(response.status).toBe(201);
    expect(result.account).toEqual({
      id: account.id,
      email: "buyer@example.com",
      fullName: "Buyer Example",
      username: "buyer_example",
      phone: "+234 801 234 5678",
      role: "buyer",
      plan: "free",
      emailVerified: false,
    });
    expect(createInput.email).toBe("buyer@example.com");
    expect(createInput.fullName).toBe("Buyer Example");
    expect(createInput.username).toBe("buyer_example");
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
      {
        email: "buyer@example.com",
        password: "a-long-password-with-12+",
        fullName: "Buyer Example",
      },
      { email: "buyer@example.com", password: "a-long-password-with-12+", role: "seller" },
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
        fullName: "Buyer Example",
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
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Seller Example" },
    });
    fireEvent.change(screen.getByLabelText("Username (optional)"), {
      target: { value: "seller_example" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-password-with-12+" },
    });
    fireEvent.change(screen.getByLabelText("I am joining as a"), {
      target: { value: "seller" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/dashboard?notice=registered",
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/accounts/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "seller@example.com",
          password: "a-long-password-with-12+",
          fullName: "Seller Example",
          username: "seller_example",
          phone: "",
          role: "seller",
        }),
      }),
    );
  });

  it("updates account details only for an authenticated session", async () => {
    database.getAccountBySessionToken.mockResolvedValue(account);

    const response = await settingsPatch(
      new Request("http://localhost/api/accounts/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `checkam_account_session=${"a".repeat(43)}`,
        },
        body: JSON.stringify({
          fullName: "Updated Buyer",
          username: "@updated_buyer",
          phone: "+234 801 234 5678",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(database.updateAccountSettings).toHaveBeenCalledWith({
      accountId: account.id,
      fullName: "Updated Buyer",
      username: "updated_buyer",
      phone: "+234 801 234 5678",
    });
    expect(await response.json()).toMatchObject({
      account: {
        fullName: "Updated Buyer",
        username: "updated_buyer",
        role: "buyer",
        plan: "free",
      },
    });
  });

  it("verifies the current password before saving a password change", async () => {
    const currentPassword = "current-password-long-enough";
    database.getAccountBySessionToken.mockResolvedValue(account);
    database.getAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash: await hashPassword(currentPassword),
    });

    const response = await settingsPatch(
      new Request("http://localhost/api/accounts/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `checkam_account_session=${"a".repeat(43)}`,
        },
        body: JSON.stringify({
          fullName: "Updated Buyer",
          username: "buyer_example",
          phone: "",
          currentPassword,
          newPassword: "a-new-password-that-is-long",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const updateInput = database.updateAccountSettings.mock.calls[0]?.[0] as {
      passwordHash: string;
    };
    expect(updateInput.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(updateInput.passwordHash).not.toBe(currentPassword);
  });

  it("shows a clear success alert after saving profile settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          account: {
            fullName: "Updated Buyer",
            username: "updated_buyer",
            phone: null,
          },
        }),
      ),
    );
    render(
      <AccountSettingsForm
        account={{
          fullName: "Buyer Example",
          username: "buyer_example",
          phone: null,
          role: "buyer",
          plan: "free",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Updated Buyer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Your settings are saved.",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/accounts/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          fullName: "Updated Buyer",
          username: "buyer_example",
          phone: "",
        }),
      }),
    );
  });

  it("rejects registration without a full name and invalid usernames", async () => {
    for (const body of [
      {
        email: "buyer@example.com",
        password: "a-long-password-with-12+",
        role: "buyer",
      },
      {
        email: "buyer@example.com",
        password: "a-long-password-with-12+",
        fullName: "Buyer Example",
        username: "not valid!",
        role: "buyer",
      },
    ]) {
      const response = await registerPost(
        jsonRequest("/api/accounts/register", body),
      );
      expect(response.status).toBe(400);
    }
    expect(database.createAccount).not.toHaveBeenCalled();
  });

  it("shows separate desktop links and the user's identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ authenticated: true, account }),
          { status: 200 },
        ),
      ),
    );
    render(<AccountNavigation />);

    const navigation = await screen.findByRole("navigation", {
      name: "Account navigation",
    });
    const desktopLinks = navigation.querySelector(".account-desktop-links");
    if (!(desktopLinks instanceof HTMLElement)) {
      throw new Error("Desktop account links were not rendered.");
    }
    expect(desktopLinks?.querySelectorAll("a")).toHaveLength(4);
    expect(within(desktopLinks).getByRole("link", { name: "Dashboard" }))
      .toBeTruthy();
    expect(within(desktopLinks).getByRole("link", { name: "Check IMEI" })
      .getAttribute("href"))
      .toBe("/#imei-check");
    expect(within(desktopLinks).getByRole("link", { name: "Pricing" }))
      .toBeTruthy();
    expect(within(desktopLinks).getByRole("link", { name: "Account" })
      .getAttribute("href"))
      .toBe("/settings");
    expect(within(desktopLinks).getByRole("link", { name: "Dashboard" })
      .getAttribute("aria-current"))
      .toBe("page");
    expect(navigation.querySelector(".account-desktop-name")?.textContent)
      .toBe("Buyer Example");
    expect(within(navigation).getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "Open account menu" }))
      .toBeTruthy();
  });

  it("opens an accessible account drawer and closes it with Escape or outside click", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ authenticated: true, account }),
          { status: 200 },
        ),
      ),
    );
    render(<AccountNavigation />);

    const menuButton = await screen.findByRole("button", {
      name: "Open account menu",
    });
    expect(menuButton.getAttribute("aria-controls")).toBe("account-menu-panel");
    fireEvent.click(menuButton);

    const menu = screen.getByRole("dialog", { name: "Account menu" });
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getByText("Buyer Example")).toBeTruthy();
    expect(within(menu).getByText("@buyer_example")).toBeTruthy();
    const closeButton = within(menu).getByRole("button", {
      name: "Close account menu",
    });
    const dashboardLink = within(menu).getByRole("link", { name: "Dashboard" });
    expect(dashboardLink.getAttribute("aria-current")).toBe("page");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(closeButton);

    const logoutButton = within(menu).getByRole("button", { name: "Log out" });
    logoutButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(menuButton.getAttribute("aria-expanded")).toBe("false");
      expect(document.body.style.overflow).toBe("");
    });
    expect(document.activeElement).toBe(menuButton);

    fireEvent.click(menuButton);
    const backdrop = document.querySelector(".account-menu-backdrop");
    expect(backdrop).not.toBeNull();
    if (backdrop) fireEvent.click(backdrop);
    await waitFor(() => {
      expect(menuButton.getAttribute("aria-expanded")).toBe("false");
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("closes the account drawer when the route changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ authenticated: true, account }),
          { status: 200 },
        ),
      ),
    );
    const { rerender } = render(<AccountNavigation />);

    const menuButton = await screen.findByRole("button", {
      name: "Open account menu",
    });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");

    router.pathname = "/settings";
    rerender(<AccountNavigation />);
    await waitFor(() =>
      expect(menuButton.getAttribute("aria-expanded")).toBe("false"),
    );
  });

  it("shows an email reminder only outside configured production", () => {
    expect(
      shouldShowEmailVerificationNotice({
        emailVerified: false,
        appEnv: "production",
        emailProvider: "configured",
      }),
    ).toBe(false);
    expect(
      shouldShowEmailVerificationNotice({
        emailVerified: false,
        appEnv: "production",
        emailProvider: undefined,
      }),
    ).toBe(true);
    expect(
      shouldShowEmailVerificationNotice({
        emailVerified: false,
        appEnv: "preview",
        emailProvider: "configured",
      }),
    ).toBe(true);
    expect(
      shouldShowEmailVerificationNotice({
        emailVerified: true,
        appEnv: "preview",
        emailProvider: undefined,
      }),
    ).toBe(false);
  });

  it("renders separate buyer and seller pricing with premium billing unavailable", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { name: "Buyer plans" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Seller plans" })).toBeTruthy();
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    const pricingText = document.body.textContent ?? "";
    expect(pricingText).toContain(
      "1 full report checkout per rolling 30 days",
    );
    expect(pricingText).toContain(
      "2 bill of sale actions per rolling 30 days",
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
