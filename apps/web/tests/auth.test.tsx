import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as authProxyPost } from "@/app/api/auth/[...segments]/route";
import { LoginForm } from "@/components/login-form";

const { router } = vi.hoisted(() => ({
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("phone login", () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests and verifies an OTP before navigating to the app route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "sent" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Nigerian phone number"), {
      target: { value: "08012345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a sign-in code" }));

    await screen.findByLabelText("Sign-in code");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/otp/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phoneNumber: "08012345678" }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Sign-in code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/app"));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/otp/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phoneNumber: "08012345678", code: "123456" }),
      }),
    );
  });

  it("shows ProblemDetails returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Too many code requests",
            detail: "Wait a little before requesting another code.",
          }),
          { status: 429 },
        ),
      ),
    );
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Nigerian phone number"), {
      target: { value: "08012345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a sign-in code" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Wait a little before requesting another code.",
    );
  });
});

describe("auth API proxy", () => {
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

  it("forwards requests and the API session cookie", async () => {
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
    const request = new NextRequest("http://localhost/api/auth/otp/request", {
      method: "POST",
      headers: {
        Cookie: "checkam_session=existing-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumber: "08012345678" }),
    });

    const response = await authProxyPost(request, {
      params: Promise.resolve({ segments: ["otp", "request"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/auth/otp/request",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "checkam_session=existing-token",
        }),
        body: JSON.stringify({ phoneNumber: "08012345678" }),
      }),
    );
  });

  it("returns ProblemDetails if no API URL is configured", async () => {
    delete process.env.CHECKAM_API_URL;
    const request = new NextRequest("http://localhost/api/auth/session");

    const response = await authProxyPost(request, {
      params: Promise.resolve({ segments: ["session"] }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.title).toBe("Authentication unavailable");
  });
});
