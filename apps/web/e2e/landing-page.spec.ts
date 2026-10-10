import { expect, test } from "@playwright/test";

test("buyer checks IMEI format and joins the feature waitlist", async ({ page }) => {
  const analyticsEvents: string[] = [];
  let savedSignup: Record<string, string> | undefined;

  await page.route("**/api/analytics", async (route) => {
    const request = route.request().postDataJSON() as { event: string };
    analyticsEvents.push(request.event);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/waitlist", async (route) => {
    savedSignup = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know what you're buying." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByLabel("Phone IMEI").fill("490154203237518");
  await page.getByRole("button", { name: "Check IMEI" }).click();
  await expect(
    page.getByText("IMEI looks valid – full report coming soon"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Get the full report – ₦500" }).click();
  await expect.poll(() => analyticsEvents).toContain("full_report_click");

  await page.getByLabel("Email address").fill("buyer@example.com");
  await page.getByLabel("Phone number (optional)").fill("+234 800 000 0000");
  await page.getByLabel("WhatsApp check").check();
  await page.getByRole("button", { name: "Join the waitlist" }).click();

  await expect(
    page.getByText("You’re on the list. Thanks for helping shape CheckAm."),
  ).toBeVisible();
  expect(savedSignup).toEqual({
    email: "buyer@example.com",
    phone: "+234 800 000 0000",
    feature: "WhatsApp check",
  });
  expect(analyticsEvents).toEqual(
    expect.arrayContaining([
      "page_view",
      "imei_check_attempted",
      "full_report_click",
    ]),
  );
});
