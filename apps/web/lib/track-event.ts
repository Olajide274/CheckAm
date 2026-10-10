export type AnalyticsEvent =
  | "page_view"
  | "imei_check_attempted"
  | "full_report_click";

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const response = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });

    if (!response.ok) {
      throw new Error(`Analytics request failed with status ${response.status}.`);
    }
  } catch (error) {
    console.error(`Unable to record analytics event "${event}".`, error);
  }
}
