import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

const allowedRoutes = new Set([
  "otp/request",
  "otp/verify",
  "session",
  "logout",
]);

async function proxyAuthRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { segments } = await context.params;
  const path = segments.join("/");
  if (!allowedRoutes.has(path)) {
    return problem(404, "Not found", "The requested authentication route was not found.");
  }

  const apiUrl = process.env.CHECKAM_API_URL;
  if (!apiUrl) {
    return problem(503, "Authentication unavailable", "The authentication service is not configured.");
  }

  let upstream: Response;
  try {
    const headers: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    const contentType = request.headers.get("content-type");
    if (cookie) headers.Cookie = cookie;
    if (contentType) headers["Content-Type"] = contentType;

    upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/${path}`, {
      method: request.method,
      headers,
      ...(request.method === "POST" ? { body: await request.text() } : {}),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    console.error("Authentication API request failed.", error);
    return problem(503, "Authentication unavailable", "The authentication service could not be reached.");
  }

  const headers = new Headers({
    "Cache-Control": "no-store",
  });
  for (const name of ["content-type", "retry-after", "set-cookie"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function problem(status: number, title: string, detail: string): Response {
  return Response.json(
    {
      type: "about:blank",
      title,
      status,
      detail,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const GET = proxyAuthRequest;
export const POST = proxyAuthRequest;
