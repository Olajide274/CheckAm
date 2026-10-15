"use client";

import { useSyncExternalStore } from "react";

const notices: Record<string, string> = {
  registered: "Your account is ready. Welcome to CheckAm.",
  "signed-in": "You’re signed in. Welcome back.",
  "signed-out": "You’ve signed out.",
};

export function AccountNotice() {
  const message = useSyncExternalStore(
    (callback) => {
      window.addEventListener("popstate", callback);
      return () => window.removeEventListener("popstate", callback);
    },
    () => {
      const notice = new URLSearchParams(window.location.search).get("notice");
      return notice ? notices[notice] ?? "" : "";
    },
    () => "",
  );

  return message ? (
    <p aria-live="polite" className="feedback-success" role="status">
      {message}
    </p>
  ) : null;
}
