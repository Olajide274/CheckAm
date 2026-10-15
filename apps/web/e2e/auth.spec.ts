import { expect, test } from "@playwright/test";

async function mockAnonymousAccount(page: import("@playwright/test").Page) {
  await page.route("**/api/analytics", (route) =>
    route.fulfill({ status: 200, json: { ok: true } }),
  );
  await page.route("**/api/accounts/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    }),
  );
}

test("landing page links to working account pages", async ({ page }) => {
  await mockAnonymousAccount(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
});

test("registration asks for profile details and account role", async ({ page }) => {
  await mockAnonymousAccount(page);
  await page.goto("/register");

  await expect(page.getByRole("heading", { name: "Create your account" }))
    .toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Username (optional)")).toBeVisible();
  await expect(page.getByLabel("I am joining as a")).toHaveAttribute(
    "required",
    "",
  );
});

test("signed-in navigation is consistent on a mobile viewport", async ({ page }) => {
  await page.route("**/api/accounts/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        account: {
          email: "buyer@example.com",
          fullName: "Buyer Example",
          username: "buyer_example",
          role: "buyer",
        },
      }),
    }),
  );
  await page.route("**/api/accounts/logout", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ loggedOut: true }),
    }),
  );
  await page.goto("/pricing");

  const navigation = page.getByRole("navigation", {
    name: "Account navigation",
  });
  await expect(navigation.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Check IMEI" })).toHaveAttribute(
    "href",
    "/#imei-check",
  );
  await expect(navigation.getByRole("link", { name: "Pricing" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Account" })).toHaveAttribute(
    "href",
    "/settings",
  );
  await expect(navigation.getByText("Buyer Example")).toBeVisible();

  await navigation.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed-out/);
  await expect(page.getByRole("status")).toHaveText("You’ve signed out.");
});
