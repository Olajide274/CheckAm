import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AppPage from "@/app/app/page";
import LoginPage from "@/app/login/page";

describe("unfinished public routes", () => {
  afterEach(cleanup);

  it.each([
    ["/login", LoginPage],
    ["/app", AppPage],
  ])("%s displays a coming soon page with a home link", (_path, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Back to CheckAm home" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByLabelText("Nigerian phone number")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  });
});
