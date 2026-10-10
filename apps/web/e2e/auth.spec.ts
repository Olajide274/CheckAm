import { expect, test } from "@playwright/test";

test("phone login opens the mobile app shell", async ({ page }) => {
  await page.route("**/api/auth/otp/request", (route) =>
    route.fulfill({ status: 202, json: { message: "If eligible, a sign-in code has been sent." } }),
  );
  await page.route("**/api/auth/otp/verify", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "Set-Cookie": "checkam_session=test-token; Path=/; HttpOnly; SameSite=Lax",
      },
      json: { authenticated: true },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, json: { authenticated: true } }),
  );

  await page.goto("/login");
  await page.getByLabel("Nigerian phone number").fill("08012345678");
  await page.getByRole("button", { name: "Send a sign-in code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Welcome to CheckAm" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Check a phone/ })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Main navigation" });
  await expect(tabs.getByRole("button")).toHaveText([
    "Check",
    "My Devices",
    "History",
    "Account",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("logged-out visitors are redirected from the app shell to login", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        title: "Sign-in required",
        status: 401,
        detail: "Sign in to continue.",
      }),
    }),
  );

  await page.goto("/app");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
