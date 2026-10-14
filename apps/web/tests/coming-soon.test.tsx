import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppPage from "@/app/app/page";
import LoginPage from "@/app/login/page";

const { redirect, router } = vi.hoisted(() => ({
  redirect: vi.fn(),
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => router,
}));

vi.mock("@/components/account-header", () => ({
  AccountHeader: () => null,
}));

describe("account routes", () => {
  afterEach(cleanup);

  it("renders the real sign-in page at /login", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeDefined();
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Create an account" }).getAttribute("href"),
    ).toBe("/register");
    expect(screen.queryByRole("heading", { name: "Coming soon" })).toBeNull();
  });

  it("redirects /app to /dashboard", () => {
    AppPage();

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
