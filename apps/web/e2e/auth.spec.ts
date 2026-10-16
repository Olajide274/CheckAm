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

test("signed-in navigation uses a drawer on a 400px viewport", async ({ page }) => {
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
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto("/pricing");

  const navigation = page.getByRole("navigation", {
    name: "Account navigation",
  });
  const menuButton = navigation.locator(".account-menu-toggle");
  await expect(menuButton).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Dashboard" })).toBeHidden();
  await expect(navigation.getByRole("link", { name: "Check IMEI" })).toBeHidden();
  await expect(navigation.getByRole("link", { name: "Pricing" })).toBeHidden();
  await expect(navigation.getByRole("link", { name: "Account" })).toBeHidden();
  await expect(navigation.getByRole("button", { name: "Log out" })).toBeHidden();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".account-menu-panel")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await menuButton.click();
  const menu = page.getByRole("dialog", { name: "Account menu" });
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByText("Buyer Example")).toBeVisible();
  await expect(menu.getByText("@buyer_example")).toBeVisible();
  for (const label of [
    "Dashboard",
    "Check IMEI",
    "Pricing",
    "Account / Settings",
    "Log out",
  ]) {
    await expect(menu.getByRole(label === "Log out" ? "button" : "link", {
      name: label,
    })).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await menuButton.click();
  await page.locator(".account-menu-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await menu.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed-out/);
  await expect(page.getByRole("status")).toHaveText("You’ve signed out.");
});

test("signed-in navigation keeps its desktop links and hides the drawer button", async ({ page }) => {
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
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/pricing");

  const navigation = page.getByRole("navigation", {
    name: "Account navigation",
  });
  await expect(navigation.getByRole("link", { name: "Dashboard" })).toBeVisible();
  for (const label of ["Dashboard", "Check IMEI", "Pricing", "Account"]) {
    await expect(navigation.getByRole("link", { name: label })).toBeVisible();
  }
  const desktopLinks = navigation.locator(".account-desktop-links");
  expect(
    await desktopLinks.evaluate(
      (element) => getComputedStyle(element).display,
    ),
  ).toBe("flex");
  expect(
    await desktopLinks.evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).gap),
    ),
  ).toBeGreaterThan(0);
  await expect(desktopLinks.locator("a")).toHaveCount(4);
  await expect(navigation.locator(".account-desktop-name")).toHaveText(
    "Buyer Example",
  );
  await expect(navigation.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Open account menu" })).toBeHidden();
});

test("logged-out landing keeps marketing actions without account links", async ({ page }) => {
  await mockAnonymousAccount(page);
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Account navigation",
  });
  await expect(navigation.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Get early access" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Log out" })).toHaveCount(0);
});

test("signed-in landing shows only app navigation in the mobile header", async ({ page }) => {
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
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto("/");

  const header = page.locator(".site-header");
  const navigation = header.getByRole("navigation", {
    name: "Account navigation",
  });
  await expect(header.getByRole("link", { name: "CheckAm home" })).toBeVisible();
  await expect(navigation.getByText("Hi, Buyer")).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Open account menu" }))
    .toBeVisible();
  await expect(header.getByRole("link", { name: "Get early access" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Bill of sale" })).toHaveCount(0);
});
