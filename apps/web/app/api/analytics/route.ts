import { recordAnalyticsEvent } from "@/lib/database";

type AnalyticsEvent =
  | "page_view"
  | "imei_check_attempted"
  | "full_report_click";

function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return (
    value === "page_view" ||
    value === "imei_check_attempted" ||
    value === "full_report_click"
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("event" in body) ||
    !isAnalyticsEvent(body.event)
  ) {
    return Response.json({ error: "Unsupported analytics event." }, { status: 400 });
  }

  try {
    await recordAnalyticsEvent(body.event);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to record analytics event.", error);
    return Response.json({ error: "Unable to record event." }, { status: 500 });
  }
}
