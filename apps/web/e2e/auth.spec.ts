import { expect, test } from "@playwright/test";

test("landing page does not link to unfinished routes", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('a[href="/login"], a[href="/app"]')).toHaveCount(0);
});

for (const path of ["/login", "/app"]) {
  test(`${path} displays a coming soon page`, async ({ page }) => {
    await page.goto(path);

    await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to CheckAm home" }),
    ).toHaveAttribute("href", "/");
    await expect(page.getByLabel("Nigerian phone number")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  });
}
